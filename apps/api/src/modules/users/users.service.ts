import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { AUDIT_ACTIONS, ERROR_CODES, PAGINATION } from "@pg-system/shared";
import { SecurityService } from "../security/security.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserListQueryDto } from "./dto/user-list-query.dto";
import { UpdateMyProfileDto } from "./dto/update-my-profile.dto";

const BCRYPT_ROUNDS = 12;

/**
 * @description 사용자(User) 관리 서비스. 관리자/대리점/가맹점 사용자 CRUD 및 역할 할당 기능 제공.
 * PCI DSS 8.x (Identification and Authentication) 준수: 사용자 식별·인증 관리
 * @security PCI DSS 8.2.1 - 고유 사용자 ID 기반 접근 통제
 * @audit 모든 사용자 작업(생성/수정/삭제/역할변경) 시 created_by/updated_by/assigned_by로 변경자 기록
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * @description 사용자 목록을 페이지네이션과 함께 조회. 유형/상태/검색어(로그인ID·이름)로 필터링 가능.
   * @param {UserListQueryDto} query - 페이지, 한도, 유형, 상태, 검색어 포함
   * @returns {Promise<{data: Array, meta: {total, page, limit, totalPages}}>} 사용자 목록 및 메타정보
   * @security PCI DSS 8.2 - 비밀번호 해시는 응답에서 제외 (select 필드 제한)
   */
  async findAll(query: UserListQueryDto) {
    const page = query.page ?? PAGINATION.DEFAULT_PAGE;
    const limit = Math.min(
      query.limit ?? PAGINATION.DEFAULT_LIMIT,
      PAGINATION.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where = {
      deleted_at: null,
      ...(query.userType !== undefined ? { user_type: query.userType } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.search !== undefined
        ? {
            OR: [
              {
                login_id: {
                  contains: query.search,
                  mode: "insensitive" as const,
                },
              },
              {
                name: { contains: query.search, mode: "insensitive" as const },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.users.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          login_id: true,
          name: true,
          email: true,
          phone: true,
          user_type: true,
          status: true,
          last_login_at: true,
          created_at: true,
        },
      }),
      this.prisma.users.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * @description 특정 사용자의 상세 정보 조회. 역할·MFA 활성화 상태 포함.
   * @param {string} id - 사용자 ID
   * @returns {Promise<Object>} 사용자 상세 정보 (역할 목록, mfa_enabled 플래그 포함)
   * @security PCI DSS 8.2 - 비밀번호 해시는 응답에서 제외
   */
  async findById(id: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, deleted_at: null },
      select: {
        id: true,
        login_id: true,
        name: true,
        email: true,
        phone: true,
        user_type: true,
        org_id: true,
        status: true,
        last_login_at: true,
        created_at: true,
        updated_at: true,
        user_roles: {
          select: {
            assigned_at: true,
            roles: {
              select: {
                id: true,
                name: true,
                user_type: true,
              },
            },
          },
        },
        user_mfa: {
          where: { is_verified: true, is_primary: true },
          select: { mfa_type: true, is_verified: true },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ERROR_CODES.USER_001,
        message: "사용자를 찾을 수 없습니다",
      });
    }

    const { user_mfa, ...rest } = user;
    return { ...rest, mfa_enabled: user_mfa.length > 0 };
  }

  /**
   * @description 새 사용자 생성. 로그인ID 중복 검증, 비밀번호 bcrypt 해싱 후 저장.
   * 역할 ID가 포함된 경우 생성과 동시에 역할 할당.
   * @param {CreateUserDto} dto - 로그인ID, 이름, 비밀번호, 유형, 이메일, 전화, 역할ID 목록
   * @param {string} createdBy - 생성자 ID (감사 추적용)
   * @returns {Promise<Object>} 생성된 사용자 정보 (비밀번호 해시 미포함)
   * @security PCI DSS 8.3.6 - bcrypt 12라운드 해싱으로 비밀번호 보호
   * @audit 생성자 기록 (created_by)
   */
  async create(dto: CreateUserDto, createdBy: string) {
    const exists = await this.prisma.users.findUnique({
      where: { login_id: dto.loginId },
    });
    if (exists) {
      throw new ConflictException({
        code: ERROR_CODES.USER_002,
        message: "이미 존재하는 로그인 아이디입니다",
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.users.create({
      data: {
        login_id: dto.loginId,
        name: dto.name,
        password_hash: passwordHash,
        user_type: dto.userType,
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        created_by: createdBy,
      },
      select: {
        id: true,
        login_id: true,
        name: true,
        email: true,
        phone: true,
        user_type: true,
        status: true,
        created_at: true,
      },
    });

    if (dto.roleIds && dto.roleIds.length > 0) {
      await this.prisma.user_roles.createMany({
        data: dto.roleIds.map((roleId) => ({
          user_id: user.id,
          role_id: roleId,
          assigned_by: createdBy,
        })),
        skipDuplicates: true,
      });
    }

    void this.security.writeAuditLog({
      userId: createdBy,
      action: AUDIT_ACTIONS.USER_CREATE,
      resourceType: 'user',
      resourceId: user.id,
      detail: { loginId: user.login_id, name: user.name, userType: user.user_type },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return user;
  }

  /**
   * @description 사용자 정보 부분 업데이트. 상태, 이름, 이메일, 전화번호 변경 가능.
   * @param {string} id - 사용자 ID
   * @param {UpdateUserDto} dto - 변경할 필드들 (부분 업데이트)
   * @param {string} updatedBy - 수정자 ID (감사 추적용)
   * @returns {Promise<Object>} 업데이트된 사용자 정보
   * @audit 수정자 및 수정 시간 기록 (updated_by)
   */
  async update(id: string, dto: UpdateUserDto, updatedBy: string) {
    await this.findById(id);

    const user = await this.prisma.users.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        updated_by: updatedBy,
      },
      select: {
        id: true,
        login_id: true,
        name: true,
        email: true,
        phone: true,
        user_type: true,
        status: true,
        updated_at: true,
      },
    });

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.USER_UPDATE,
      resourceType: 'user',
      resourceId: id,
      detail: { changes: { ...dto } },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return user;
  }

  /**
   * @description 사용자 본인 프로필 업데이트 (비밀번호 변경). 관리자 아닌 본인만 사용.
   * @param {string} id - 사용자 ID (본인)
   * @param {UpdateMyProfileDto} dto - 새 비밀번호 (선택적)
   * @returns {Promise<Object>} 업데이트된 프로필 정보
   * @security PCI DSS 8.3.6 - 새 비밀번호 bcrypt 12라운드 해싱
   */
  async updateProfile(id: string, dto: UpdateMyProfileDto) {
    await this.findById(id);

    if (dto.newPassword === undefined) {
      return this.findById(id);
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    const user = await this.prisma.users.update({
      where: { id },
      data: { password_hash: passwordHash, updated_by: id },
      select: {
        id: true,
        login_id: true,
        user_type: true,
        status: true,
        updated_at: true,
      },
    });

    void this.security.writeAuditLog({
      userId: id,
      action: AUDIT_ACTIONS.USER_PROFILE_UPDATE,
      resourceType: 'user',
      resourceId: id,
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return user;
  }

  /**
   * @description 사용자 소프트 삭제. deleted_at 타임스탬프 기록, 실제 데이터는 보존.
   * @param {string} id - 사용자 ID
   * @param {string} updatedBy - 삭제 처리자 ID (감사 추적용)
   * @audit 삭제자 및 삭제 시간 기록 (deleted_at, updated_by)
   */
  async remove(id: string, updatedBy: string): Promise<void> {
    await this.findById(id);
    await this.prisma.users.update({
      where: { id },
      data: { deleted_at: new Date(), updated_by: updatedBy },
    });

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.USER_DELETE,
      resourceType: 'user',
      resourceId: id,
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));
  }

  /**
   * @description 사용자에게 역할을 일괄 할당. 기존 역할 전체 삭제 후 새 역할 목록으로 교체 (replace-all 방식).
   * @param {string} userId - 대상 사용자 ID
   * @param {string[]} roleIds - 할당할 역할 ID 목록
   * @param {string} assignedBy - 할당자 ID (감사 추적용)
   * @returns {Promise<{data: Array}>} 업데이트된 역할 목록
   * @security PCI DSS 7.1.1 - 역할 할당을 통한 접근 권한 제어
   * @audit 할당자 기록 (assigned_by)
   */
  async assignRoles(userId: string, roleIds: string[], assignedBy: string) {
    await this.findById(userId);

    await this.prisma.$transaction([
      this.prisma.user_roles.deleteMany({ where: { user_id: userId } }),
      this.prisma.user_roles.createMany({
        data: roleIds.map((roleId) => ({
          user_id: userId,
          role_id: roleId,
          assigned_by: assignedBy,
        })),
        skipDuplicates: true,
      }),
    ]);

    // 권한 캐시 무효화 — 역할 변경 시 JWT 갱신 전까지 기존 권한 캐시 사용 방지
    await this.cache.del(`user_permissions:${userId}`);

    void this.security.writeAuditLog({
      userId: assignedBy,
      action: AUDIT_ACTIONS.USER_ASSIGN_ROLES,
      resourceType: 'user',
      resourceId: userId,
      detail: { roleIds },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return this.getUserRoles(userId);
  }

  /**
   * @description 특정 사용자에게 할당된 역할 목록 조회.
   * @param {string} userId - 사용자 ID
   * @returns {Promise<{data: Array}>} 역할 목록 (역할명, 설명, 할당일 포함)
   */
  async getUserRoles(userId: string) {
    await this.findById(userId);

    const userRoles = await this.prisma.user_roles.findMany({
      where: { user_id: userId },
      select: {
        assigned_at: true,
        roles: {
          select: {
            id: true,
            name: true,
            description: true,
            user_type: true,
          },
        },
      },
    });

    return { data: userRoles };
  }
}
