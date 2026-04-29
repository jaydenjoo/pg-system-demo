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
import { AUDIT_ACTIONS, ERROR_CODES, CACHE_TTL } from "@pg-system/shared";
import { SecurityService } from "../security/security.service";
import { CreateSystemCodeDto } from "./dto/create-system-code.dto";
import { UpdateSystemCodeDto } from "./dto/update-system-code.dto";

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly security: SecurityService,
  ) {}

  async getSystemCodes() {
    const cacheKey = "system_codes:all";
    const cached = await this.cache.get<Awaited<ReturnType<typeof this.prisma.system_codes.findMany>>>(cacheKey);
    if (cached) return cached;

    const result = await this.prisma.system_codes.findMany({
      where: { is_active: true },
      orderBy: [{ group_code: "asc" }, { sort_order: "asc" }],
    });
    await this.cache.set(cacheKey, result, CACHE_TTL.SYSTEM_CODES);
    return result;
  }

  async getCodesByGroup(groupCode: string) {
    const cacheKey = `system_codes:group:${groupCode}`;
    const cached = await this.cache.get<Awaited<ReturnType<typeof this.prisma.system_codes.findMany>>>(cacheKey);
    if (cached) return cached;

    const result = await this.prisma.system_codes.findMany({
      where: { group_code: groupCode, is_active: true },
      orderBy: { sort_order: "asc" },
    });
    await this.cache.set(cacheKey, result, CACHE_TTL.SYSTEM_CODES);
    return result;
  }

  async createCode(dto: CreateSystemCodeDto, _performedBy: string) {
    const exists = await this.prisma.system_codes.findUnique({
      where: { group_code_code: { group_code: dto.groupCode, code: dto.code } },
    });
    if (exists) {
      throw new ConflictException({
        code: ERROR_CODES.SYS_002,
        message: "이미 존재하는 시스템 코드입니다",
      });
    }

    const result = await this.prisma.system_codes.create({
      data: {
        group_code: dto.groupCode,
        code: dto.code,
        name: dto.name,
        ...(dto.sortOrder !== undefined ? { sort_order: dto.sortOrder } : {}),
        ...(dto.extraValue1 !== undefined
          ? { extra_value1: dto.extraValue1 }
          : {}),
        ...(dto.extraValue2 !== undefined
          ? { extra_value2: dto.extraValue2 }
          : {}),
      },
    });

    await this.cache.del("system_codes:all");
    await this.cache.del(`system_codes:group:${dto.groupCode}`);

    void this.security.writeAuditLog({
      userId: _performedBy,
      action: AUDIT_ACTIONS.SYSTEM_CODE_CREATE,
      resourceType: 'system_code',
      resourceId: result.id,
      detail: { groupCode: dto.groupCode, code: dto.code, name: dto.name },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return result;
  }

  async updateCode(id: string, dto: UpdateSystemCodeDto, _performedBy: string) {
    const existing = await this.prisma.system_codes.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ERROR_CODES.SYS_001,
        message: "시스템 코드를 찾을 수 없습니다",
      });
    }

    const result = await this.prisma.system_codes.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.sortOrder !== undefined ? { sort_order: dto.sortOrder } : {}),
        ...(dto.extraValue1 !== undefined
          ? { extra_value1: dto.extraValue1 }
          : {}),
        ...(dto.extraValue2 !== undefined
          ? { extra_value2: dto.extraValue2 }
          : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
    });

    await this.cache.del("system_codes:all");
    await this.cache.del(`system_codes:group:${existing.group_code}`);

    void this.security.writeAuditLog({
      userId: _performedBy,
      action: AUDIT_ACTIONS.SYSTEM_CODE_UPDATE,
      resourceType: 'system_code',
      resourceId: id,
      detail: { changes: { ...dto } },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return result;
  }

  async deleteCode(id: string, _performedBy: string): Promise<void> {
    const existing = await this.prisma.system_codes.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ERROR_CODES.SYS_001,
        message: "시스템 코드를 찾을 수 없습니다",
      });
    }

    await this.prisma.system_codes.update({
      where: { id },
      data: { is_active: false },
    });

    await this.cache.del("system_codes:all");
    await this.cache.del(`system_codes:group:${existing.group_code}`);

    void this.security.writeAuditLog({
      userId: _performedBy,
      action: AUDIT_ACTIONS.SYSTEM_CODE_DELETE,
      resourceType: 'system_code',
      resourceId: id,
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));
  }

  async getHolidays() {
    const currentYear = new Date().getFullYear();
    const cacheKey = `holidays:${currentYear}`;
    const cached = await this.cache.get<Awaited<ReturnType<typeof this.prisma.holidays.findMany>>>(
      cacheKey,
    );
    if (cached) return cached;

    const result = await this.prisma.holidays.findMany({
      where: {
        holiday_date: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31`),
        },
      },
      orderBy: { holiday_date: "asc" },
    });
    await this.cache.set(cacheKey, result, CACHE_TTL.HOLIDAYS);
    return result;
  }

  async getMenuTree() {
    const cacheKey = "menu_tree";
    type MenuRow = Awaited<ReturnType<typeof this.prisma.menus.findMany>>[number];
    type MenuNode = MenuRow & { children: MenuNode[] };
    const cached = await this.cache.get<MenuNode[]>(cacheKey);
    if (cached) return cached;

    const menus = await this.prisma.menus.findMany({
      where: { is_active: true },
      orderBy: [{ parent_id: "asc" }, { sort_order: "asc" }],
    });

    const menuMap = new Map<string, MenuNode>();
    const roots: MenuNode[] = [];

    for (const menu of menus) {
      menuMap.set(menu.id, { ...menu, children: [] });
    }

    for (const menu of menuMap.values()) {
      if (menu.parent_id === null) {
        roots.push(menu);
      } else {
        const parent = menuMap.get(menu.parent_id);
        if (parent !== undefined) {
          parent.children.push(menu);
        }
      }
    }

    await this.cache.set(cacheKey, roots, CACHE_TTL.MENU_TREE);
    return roots;
  }

  async getActiveNotifications() {
    const cacheKey = "notifications:active";
    const cached = await this.cache.get<Awaited<ReturnType<typeof this.prisma.notifications.findMany>>>(
      cacheKey,
    );
    if (cached) return cached;

    const result = await this.prisma.notifications.findMany({
      where: { is_read: false },
      orderBy: { created_at: "desc" },
      take: 20,
    });
    await this.cache.set(cacheKey, result, CACHE_TTL.NOTIFICATIONS);
    return result;
  }
}
