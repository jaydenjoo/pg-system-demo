import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ERROR_CODES,
  PAGINATION,
  AgentStatusCode,
  AUDIT_ACTIONS,
  maskBankAccount,
} from "@pg-system/shared";
import { SecurityService } from "../security/security.service";
import { CreateAgentDto } from "./dto/create-agent.dto";
import { UpdateAgentDto } from "./dto/update-agent.dto";
import { AgentListQueryDto } from "./dto/agent-list-query.dto";

const AGENT_LIST_SELECT = {
  id: true,
  agent_code: true,
  agent_name: true,
  status: true,
  tree_path: true,
  tree_depth: true,
  contract_start_date: true,
  contract_end_date: true,
  bank_name: true,
  bank_account: true,
  bank_holder: true,
  created_at: true,
  created_by: true,
  updated_at: true,
  updated_by: true,
  companies: {
    select: {
      id: true,
      company_name: true,
      business_no: true,
      representative: true,
    },
  },
} as const;

/**
 * @description 대리점(Agent) 관리 서비스. 대리점 생성, 조회, 트리 구조 관리, 상태 제어 기능 제공.
 * PCI DSS 7.x (Access Control) 준수: 대리점별 권한 및 접근 제어 관리
 * @security PCI DSS 7.1.1 - 대리점의 접근 권한 제한 및 감시
 * @audit 모든 대리점 작업(생성/수정/삭제) 시 created_by/updated_by로 누가 변경했는지 기록
 */
@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
  ) {}

  /**
   * @description 대리점 목록을 페이지네이션과 함께 조회. 상태/검색어로 필터링 가능.
   * @param {AgentListQueryDto} query - 페이지, 한도, 상태, 검색어 포함
   * @returns {Promise<{data: Array, meta: {total, page, limit, totalPages}}>} 대리점 목록 및 메타정보
   * @security PCI DSS 3.2.1 - 계좌번호는 마스킹처리 후 반환
   * @audit 조회 기록은 불필요 (읽기 전용)
   */
  async findAll(query: AgentListQueryDto) {
    const page = query.page ?? PAGINATION.DEFAULT_PAGE;
    const limit = Math.min(
      query.limit ?? PAGINATION.DEFAULT_LIMIT,
      PAGINATION.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where = {
      deleted_at: null,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.search !== undefined
        ? {
            agent_name: {
              contains: query.search,
              mode: "insensitive" as const,
            },
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.agents.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
        select: AGENT_LIST_SELECT,
      }),
      this.prisma.agents.count({ where }),
    ]);

    return {
      data: rows.map((a) => ({
        ...a,
        bank_account: maskBankAccount(a.bank_account),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * @description 특정 대리점의 상세 정보 조회. 부모/자식 대리점 정보 포함.
   * @param {string} id - 대리점 ID
   * @returns {Promise<Agent>} 대리점 상세 정보 (계좌번호는 마스킹됨)
   * @security PCI DSS 7.1.2 - 대리점 정보의 접근 제어
   * @audit 존재하지 않는 대리점 접근 시도는 NotFoundException으로 감지
   */
  async findOne(id: string) {
    const agent = await this.prisma.agents.findFirst({
      where: { id, deleted_at: null },
      select: {
        id: true,
        agent_code: true,
        agent_name: true,
        status: true,
        tree_path: true,
        tree_depth: true,
        parent_id: true,
        contract_start_date: true,
        contract_end_date: true,
        bank_name: true,
        bank_account: true,
        bank_holder: true,
        created_at: true,
        created_by: true,
        updated_at: true,
        updated_by: true,
        companies: {
          select: {
            id: true,
            company_name: true,
            business_no: true,
            representative: true,
          },
        },
        merchants: {
          where: { deleted_at: null },
          select: {
            id: true,
            merchant_code: true,
            merchant_name: true,
            status: true,
          },
        },
      },
    });

    if (!agent) {
      throw new NotFoundException({
        code: ERROR_CODES.AGENT_001,
        message: "대리점을 찾을 수 없습니다",
      });
    }

    return { ...agent, bank_account: maskBankAccount(agent.bank_account) };
  }

  /**
   * @description 새로운 대리점을 생성. 트리 구조 기반으로 부모 대리점 지정 가능.
   * 중복 코드 체크 및 부모 대리점 유효성 검증, 트리 경로 자동 생성.
   * @param {CreateAgentDto} dto - 대리점 코드, 이름, 상위 대리점ID, 계약정보, 계좌정보 등
   * @param {string} createdBy - 생성자 ID (감사 추적용)
   * @returns {Promise<Agent>} 생성된 대리점 정보 (tree_path, tree_depth 포함, 계좌번호는 마스킹됨)
   * @security PCI DSS 7.1.1 - 대리점 계층 검증을 통한 접근 제어 구조 구성
   * @audit 대리점 생성자 기록 (created_by)
   */
  /**
   * @description 대리점 코드 자동 채번. A + YYYYMMDD + 3자리 순번.
   * @returns {Promise<string>} 생성된 대리점 코드 (예: A20260301001)
   */
  private async generateAgentCode(): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const prefix = `A${yyyy}${mm}${dd}`;

    const count = await this.prisma.agents.count({
      where: { agent_code: { startsWith: prefix } },
    });

    return `${prefix}${String(count + 1).padStart(3, "0")}`;
  }

  async create(dto: CreateAgentDto, createdBy: string) {
    const agentCode = await this.generateAgentCode();
    const companyId = randomUUID();
    const newId = randomUUID();
    let treePath = `/${newId}`;
    let treeDepth = 0;

    if (dto.parentAgentId !== undefined) {
      const parent = await this.prisma.agents.findFirst({
        where: { id: dto.parentAgentId, deleted_at: null },
        select: { id: true, tree_path: true, tree_depth: true, status: true },
      });
      if (!parent) {
        throw new NotFoundException({
          code: ERROR_CODES.AGENT_001,
          message: "상위 대리점을 찾을 수 없습니다",
        });
      }
      if (parent.status !== "ACTIVE") {
        throw new BadRequestException({
          code: ERROR_CODES.AGENT_003,
          message: "상위 대리점이 활성 상태가 아닙니다",
        });
      }
      treePath = `${parent.tree_path ?? ""}/${newId}`;
      treeDepth = parent.tree_depth + 1;
    }

    const [, agent] = await this.prisma.$transaction([
      this.prisma.companies.create({
        data: {
          id: companyId,
          business_no: dto.businessNo,
          company_name: dto.agentName,
          representative: dto.representative ?? dto.agentName,
          business_type: dto.businessType ?? "서비스업",
          created_by: createdBy,
          updated_by: createdBy,
        },
      }),
      this.prisma.agents.create({
        data: {
          id: newId,
          company_id: companyId,
          agent_code: agentCode,
          agent_name: dto.agentName,
          parent_id: dto.parentAgentId ?? null,
          tree_path: treePath,
          tree_depth: treeDepth,
          contract_start_date: dto.contractStartDate ?? null,
          contract_end_date: dto.contractEndDate ?? null,
          bank_name: dto.bankName ?? null,
          bank_account: dto.bankAccount ?? null,
          bank_holder: dto.bankHolder ?? null,
          created_by: createdBy,
          updated_by: createdBy,
        },
        select: AGENT_LIST_SELECT,
      }),
    ]);

    void this.security.writeAuditLog({
      userId: createdBy,
      action: AUDIT_ACTIONS.AGENT_CREATE,
      resourceType: 'agent',
      resourceId: agent.id,
      detail: { agentCode: agent.agent_code, agentName: agent.agent_name },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return { ...agent, bank_account: maskBankAccount(agent.bank_account) };
  }

  /**
   * @description 대리점 정보를 부분 업데이트. 이름, 상태 등 변경 가능.
   * @param {string} id - 대리점 ID
   * @param {UpdateAgentDto} dto - 업데이트할 필드들 (부분 업데이트 가능)
   * @param {string} updatedBy - 수정자 ID (감사 추적용)
   * @returns {Promise<Agent>} 업데이트된 대리점 정보 (계좌번호는 마스킹됨)
   * @security PCI DSS 7.1.1 - 대리점 정보 변경 시 감시
   * @audit 수정자 및 수정 시간 기록 (updated_by, updated_at)
   */
  async update(id: string, dto: UpdateAgentDto, updatedBy: string) {
    await this.findOne(id);
    const agent = await this.prisma.agents.update({
      where: { id },
      data: {
        ...(dto.agentName !== undefined ? { agent_name: dto.agentName } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        updated_by: updatedBy,
      },
      select: AGENT_LIST_SELECT,
    });

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.AGENT_UPDATE,
      resourceType: 'agent',
      resourceId: id,
      detail: { changes: { ...dto } },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return { ...agent, bank_account: maskBankAccount(agent.bank_account) };
  }

  /**
   * @description 특정 대리점의 직속 하위 대리점 목록 조회.
   * @param {string} id - 상위 대리점 ID
   * @returns {Promise<Agent[]>} 하위 대리점 목록 (계좌번호는 마스킹됨)
   * @security PCI DSS 7.1.2 - 대리점 계층 구조 확인
   * @audit 조회 기록은 불필요 (읽기 전용)
   */
  async getSubAgents(id: string) {
    await this.findOne(id);
    const subAgents = await this.prisma.agents.findMany({
      where: { parent_id: id, deleted_at: null },
      orderBy: { created_at: "desc" },
      select: AGENT_LIST_SELECT,
    });
    return subAgents.map((a) => ({
      ...a,
      bank_account: maskBankAccount(a.bank_account),
    }));
  }

  /**
   * @description 대리점 상태를 변경 (활성/비활성 등).
   * @param {string} id - 대리점 ID
   * @param {AgentStatusCode} status - 변경할 상태 코드 (ACTIVE, INACTIVE, SUSPENDED 등)
   * @param {string} updatedBy - 변경자 ID (감사 추적용)
   * @returns {Promise<Agent>} 상태 변경된 대리점 정보
   * @security PCI DSS 7.1.1 - 대리점 접근 제어 상태 변경
   * @audit 상태 변경자 및 변경 시간 기록
   */
  async changeStatus(id: string, status: AgentStatusCode, updatedBy: string) {
    await this.findOne(id);
    const agent = await this.prisma.agents.update({
      where: { id },
      data: { status, updated_by: updatedBy },
      select: AGENT_LIST_SELECT,
    });

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.AGENT_STATUS_CHANGE,
      resourceType: 'agent',
      resourceId: id,
      detail: { status },
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));

    return { ...agent, bank_account: maskBankAccount(agent.bank_account) };
  }

  /**
   * @description 대리점을 소프트 삭제. 하위 대리점이나 연결된 가맹점이 없을 때만 가능.
   * @param {string} id - 대리점 ID
   * @param {string} updatedBy - 삭제자 ID (감사 추적용)
   * @returns {Promise<void>}
   * @security PCI DSS 7.1.1 - 대리점 삭제 시 접근 제어 정리
   * @audit 삭제자 및 삭제 시간 기록 (deleted_at, updated_by)
   */
  async remove(id: string, updatedBy: string): Promise<void> {
    await this.findOne(id);

    const subAgentCount = await this.prisma.agents.count({
      where: { parent_id: id, deleted_at: null },
    });
    if (subAgentCount > 0) {
      throw new BadRequestException({
        code: ERROR_CODES.AGENT_004,
        message: "하위 대리점이 있어 삭제할 수 없습니다",
      });
    }

    const merchantCount = await this.prisma.merchants.count({
      where: { agent_id: id, deleted_at: null },
    });
    if (merchantCount > 0) {
      throw new BadRequestException({
        code: ERROR_CODES.AGENT_005,
        message: "연결된 가맹점이 있어 삭제할 수 없습니다",
      });
    }

    await this.prisma.agents.update({
      where: { id },
      data: { deleted_at: new Date(), updated_by: updatedBy },
    });

    void this.security.writeAuditLog({
      userId: updatedBy,
      action: AUDIT_ACTIONS.AGENT_DELETE,
      resourceType: 'agent',
      resourceId: id,
    }).catch((e) => this.logger.error('감사 로그 기록 실패', e));
  }
}
