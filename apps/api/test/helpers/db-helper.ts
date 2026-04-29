import { INestApplication } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../src/prisma/prisma.service";

const ADMIN_PASSWORD = "Admin1234!@";

export function getTestPrisma(app: INestApplication): PrismaService {
  return app.get<PrismaService>(PrismaService);
}

/**
 * admin 계정을 초기 상태로 복원 (비밀번호 리셋 + 잠금 해제)
 */
export async function resetAdminUser(prisma: PrismaService): Promise<void> {
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
  await prisma.users.update({
    where: { login_id: "admin" },
    data: {
      password_hash: hash,
      failed_login_count: 0,
      locked_until: null,
    },
  });
}

/**
 * 통합 테스트에서 생성된 데이터 정리 (시드 데이터는 유지)
 * 외래키 종속성 순서대로 자식 테이블부터 삭제
 */
export async function cleanupTestData(prisma: PrismaService): Promise<void> {
  await prisma.$transaction([
    // PG Gateway (자식 → 부모 순서)
    prisma.pg_webhooks.deleteMany(),
    prisma.pg_payment_orders.deleteMany(),
    prisma.pg_api_keys.deleteMany(),

    // 6. 보안/감사 — 자식 우선
    prisma.risk_alerts.deleteMany(),
    prisma.login_history.deleteMany(),
    prisma.audit_logs.deleteMany(),

    // 5. 정산/입금
    prisma.deposit_transactions.deleteMany(),
    prisma.deposits.deleteMany(),
    prisma.escrow_records.deleteMany(),
    prisma.settlements.deleteMany(),
    prisma.agent_settlements.deleteMany(),

    // 4. 거래
    prisma.transactions.deleteMany(),

    // 3. 수수료
    prisma.merchant_item_fees.deleteMany(),
    prisma.merchant_commissions.deleteMany(),
    prisma.agent_commissions.deleteMany(),
    prisma.pg_default_margins.deleteMany(),

    // 2. 조직
    prisma.merchant_terminals.deleteMany(),
    prisma.merchants.deleteMany(),
    prisma.agents.deleteMany(),
    prisma.companies.deleteMany(),

    // 7. 시스템
    prisma.notifications.deleteMany(),
    prisma.menus.deleteMany(),
    prisma.holidays.deleteMany(),

    // 1. 인증/사용자 — 시드 데이터 제외
    prisma.refresh_tokens.deleteMany(),
    prisma.user_mfa.deleteMany(),
    prisma.user_roles.deleteMany({
      where: {
        users: { login_id: { not: "admin" } },
      },
    }),
    prisma.users.deleteMany({
      where: { login_id: { not: "admin" } },
    }),
  ]);
}
