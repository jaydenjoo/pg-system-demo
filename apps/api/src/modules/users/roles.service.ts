import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";
import { PrismaService } from "../../prisma/prisma.service";
import { AUDIT_ACTIONS, ERROR_CODES } from "@pg-system/shared";
import { SecurityService } from "../security/security.service";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";

/**
 * @description 역할(Role) 및 권한(Permission) 관리 서비스. RBAC 기반 접근 제어 구현.
 * 역할 생성·수정·삭제, 권한 할당·조회 기능을 제공.
 * PCI DSS 7.x (Restrict Access) 준수: 최소 권한 원칙 기반 접근 제어
 * @security PCI DSS 7.1 - 업무 역할별 접근 권한 정의 및 관리
 * @audit 역할 변경 시 performedBy 파라미터로 변경자 추적 (향후 감사 로그 연동용)
 */
@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * @description 모든 역할 목록을 권한 정보와 함께 조회. 이름순 정렬.
   * @returns {Promise<{data: Array}>} 역할 목록 (각 역할에 할당된 권한 포함)
   */
  async findAllRoles() {
    const roles = await this.prisma.roles.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        user_type: true,
        created_at: true,
        role_permissions: {
          select: {
            permissions: {
              select: {
                id: true,
                code: true,
                name: true,
                resource: true,
                action: true,
              },
            },
          },
        },
      },
    });
    return { data: roles };
  }

  /**
   * @description 특정 역할의 상세 정보 조회. 할당된 권한 목록 포함.
   * @param {string} id - 역할 ID
   * @returns {Promise<Object>} 역할 상세 (이름, 설명, 유형, 권한 목록)
   */
  async findRoleById(id: string) {
    const role = await this.prisma.roles.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        user_type: true,
        created_at: true,
        updated_at: true,
        role_permissions: {
          select: {
            permissions: {
              select: {
                id: true,
                code: true,
                name: true,
                resource: true,
                action: true,
              },
            },
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException({
        code: ERROR_CODES.ROLE_001,
        message: "역할을 찾을 수 없습니다",
      });
    }

    return role;
  }

  /**
   * @description 새 역할 생성. 이름 중복 검증 후 역할 생성, 권한 ID 목록이 있으면 동시 할당.
   * @param {CreateRoleDto} dto - 역할명, 유형, 설명, 권한ID 목록
   * @param {string} _performedBy - 생성자 ID (감사 추적용)
   * @returns {Promise<Object>} 생성된 역할 정보
   * @security PCI DSS 7.1 - 역할 기반 접근 제어 구조 정의
   */
  async createRole(dto: CreateRoleDto, _performedBy: string) {
    const exists = await this.prisma.roles.findUnique({
      where: { name: dto.name },
    });
    if (exists) {
      throw new ConflictException({
        code: ERROR_CODES.ROLE_002,
        message: "이미 존재하는 역할 이름입니다",
      });
    }

    const role = await this.prisma.roles.create({
      data: {
        name: dto.name,
        user_type: dto.userType,
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        user_type: true,
        created_at: true,
      },
    });

    if (dto.permissionIds && dto.permissionIds.length > 0) {
      await this.prisma.role_permissions.createMany({
        data: dto.permissionIds.map((permissionId) => ({
          role_id: role.id,
          permission_id: permissionId,
        })),
        skipDuplicates: true,
      });
    }

    void this.security.writeAuditLog({
      userId: _performedBy,
      action: AUDIT_ACTIONS.ROLE_CREATE,
      resourceType: 'role',
      resourceId: role.id,
      detail: { name: role.name, userType: role.user_type },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return role;
  }

  /**
   * @description 역할 정보 부분 업데이트. 이름, 설명 변경 가능.
   * @param {string} id - 역할 ID
   * @param {UpdateRoleDto} dto - 변경할 필드 (부분 업데이트)
   * @param {string} _performedBy - 수정자 ID (감사 추적용)
   * @returns {Promise<Object>} 업데이트된 역할 정보
   */
  async updateRole(id: string, dto: UpdateRoleDto, _performedBy: string) {
    await this.findRoleById(id);

    const role = await this.prisma.roles.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        user_type: true,
        updated_at: true,
      },
    });

    void this.security.writeAuditLog({
      userId: _performedBy,
      action: AUDIT_ACTIONS.ROLE_UPDATE,
      resourceType: 'role',
      resourceId: id,
      detail: { changes: { ...dto } },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return role;
  }

  /**
   * @description 역할 삭제. 사용 중인 사용자가 있으면 삭제 거부. 권한 매핑도 함께 삭제.
   * @param {string} id - 역할 ID
   * @param {string} _performedBy - 삭제자 ID (감사 추적용)
   * @security PCI DSS 7.1.1 - 역할 삭제 전 사용자 할당 여부 확인
   */
  async deleteRole(id: string, _performedBy: string): Promise<void> {
    await this.findRoleById(id);

    const usageCount = await this.prisma.user_roles.count({
      where: { role_id: id },
    });
    if (usageCount > 0) {
      throw new ConflictException({
        code: ERROR_CODES.ROLE_003,
        message: "사용 중인 역할은 삭제할 수 없습니다",
      });
    }

    await this.prisma.$transaction([
      this.prisma.role_permissions.deleteMany({ where: { role_id: id } }),
      this.prisma.roles.delete({ where: { id } }),
    ]);

    void this.security.writeAuditLog({
      userId: _performedBy,
      action: AUDIT_ACTIONS.ROLE_DELETE,
      resourceType: 'role',
      resourceId: id,
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));
  }

  /**
   * @description 역할에 권한 일괄 할당. 기존 권한 전체 삭제 후 새 권한 목록으로 교체 (replace-all 방식).
   * @param {string} roleId - 대상 역할 ID
   * @param {string[]} permissionIds - 할당할 권한 ID 목록
   * @param {string} _performedBy - 할당자 ID (감사 추적용)
   * @returns {Promise<Object>} 업데이트된 역할 상세 (권한 포함)
   * @security PCI DSS 7.1 - 역할별 권한 재정의
   */
  async assignPermissions(
    roleId: string,
    permissionIds: string[],
    _performedBy: string,
  ) {
    await this.findRoleById(roleId);

    await this.prisma.$transaction([
      this.prisma.role_permissions.deleteMany({ where: { role_id: roleId } }),
      this.prisma.role_permissions.createMany({
        data: permissionIds.map((permissionId) => ({
          role_id: roleId,
          permission_id: permissionId,
        })),
        skipDuplicates: true,
      }),
    ]);

    // 권한 캐시 무효화 — 해당 역할을 가진 모든 사용자의 캐시 삭제
    const affectedUsers = await this.prisma.user_roles.findMany({
      where: { role_id: roleId },
      select: { user_id: true },
    });
    await Promise.all(
      affectedUsers.map((ur) => this.cache.del(`user_permissions:${ur.user_id}`)),
    );

    void this.security.writeAuditLog({
      userId: _performedBy,
      action: AUDIT_ACTIONS.ROLE_ASSIGN_PERMISSIONS,
      resourceType: 'role',
      resourceId: roleId,
      detail: { permissionIds },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return this.findRoleById(roleId);
  }

  /**
   * @description 시스템에 등록된 모든 권한 목록 조회. 리소스·액션순 정렬.
   * @returns {Promise<{data: Array}>} 권한 목록 (코드, 이름, 리소스, 액션)
   */
  async getAllPermissions() {
    const permissions = await this.prisma.permissions.findMany({
      orderBy: [{ resource: "asc" }, { action: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        resource: true,
        action: true,
      },
    });
    return { data: permissions };
  }
}
