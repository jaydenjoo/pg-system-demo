import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import {
  ROLES,
  USER_TYPES,
  PERMISSION_DEFS,
  ROLE_DEFS,
  ROLE_PERMISSION_MAP,
  SYSTEM_CODE_DEFS,
} from "@pg-system/shared";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("🌱 Seeding database...");

  await prisma.$transaction(async (tx) => {
    // 1. 권한 upsert
    console.log("  → permissions");
    for (const perm of PERMISSION_DEFS) {
      await tx.permissions.upsert({
        where: { code: perm.code },
        update: {
          name: perm.name,
          resource: perm.resource,
          action: perm.action,
        },
        create: {
          code: perm.code,
          name: perm.name,
          resource: perm.resource,
          action: perm.action,
        },
      });
    }

    // 2. 역할 upsert
    console.log("  → roles");
    for (const role of ROLE_DEFS) {
      await tx.roles.upsert({
        where: { name: role.name },
        update: { description: role.description, user_type: role.userType },
        create: {
          name: role.name,
          description: role.description,
          user_type: role.userType,
        },
      });
    }

    // 3. 역할-권한 매핑
    console.log("  → role_permissions");
    for (const [roleName, permCodes] of Object.entries(ROLE_PERMISSION_MAP)) {
      const role = await tx.roles.findUniqueOrThrow({
        where: { name: roleName },
      });
      for (const permCode of permCodes) {
        const perm = await tx.permissions.findUniqueOrThrow({
          where: { code: permCode },
        });
        await tx.role_permissions.upsert({
          where: {
            role_id_permission_id: { role_id: role.id, permission_id: perm.id },
          },
          update: {},
          create: { role_id: role.id, permission_id: perm.id },
        });
      }
    }

    // 4. 시스템 코드 upsert
    console.log("  → system_codes");
    for (const sc of SYSTEM_CODE_DEFS) {
      await tx.system_codes.upsert({
        where: { group_code_code: { group_code: sc.groupCode, code: sc.code } },
        update: { name: sc.name, sort_order: sc.sortOrder },
        create: {
          group_code: sc.groupCode,
          code: sc.code,
          name: sc.name,
          sort_order: sc.sortOrder,
        },
      });
    }

    // 5. 슈퍼어드민 계정
    console.log("  → super admin user");
    const adminLoginId = "admin";
    const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin1234!@";
    const passwordHash = await bcrypt.hash(seedPassword, 12);

    const adminUser = await tx.users.upsert({
      where: { login_id: adminLoginId },
      update: {
        password_hash: passwordHash,
        status: "ACTIVE",
        failed_login_count: 0,
        locked_until: null,
      },
      create: {
        login_id: adminLoginId,
        password_hash: passwordHash,
        name: "최고관리자",
        user_type: USER_TYPES.ADMIN,
        status: "ACTIVE",
      },
    });

    // 슈퍼어드민 역할 부여
    const superAdminRole = await tx.roles.findUniqueOrThrow({
      where: { name: ROLES.SUPER_ADMIN },
    });
    await tx.user_roles.upsert({
      where: {
        user_id_role_id: { user_id: adminUser.id, role_id: superAdminRole.id },
      },
      update: {},
      create: { user_id: adminUser.id, role_id: superAdminRole.id },
    });

    // 6. 테스트 회사 생성 (대리점/가맹점의 모회사)
    console.log("  → test company");
    const testCompany = await tx.companies.upsert({
      where: { business_no: "000-00-00000" },
      update: { company_name: "테스트PG", representative: "테스트대표" },
      create: {
        business_no: "000-00-00000",
        company_name: "테스트PG",
        representative: "테스트대표",
        business_type: "PG",
      },
    });

    // 7. 테스트 대리점 생성
    console.log("  → test agent");
    const testAgent = await tx.agents.upsert({
      where: { agent_code: "AGT-TEST-001" },
      update: { agent_name: "테스트대리점", status: "ACTIVE" },
      create: {
        company_id: testCompany.id,
        agent_code: "AGT-TEST-001",
        agent_name: "테스트대리점",
        status: "ACTIVE",
      },
    });

    // 8. 테스트 가맹점 생성 (대리점 소속)
    console.log("  → test merchant");
    const testMerchant = await tx.merchants.upsert({
      where: { merchant_code: "MCH-TEST-001" },
      update: {
        merchant_name: "테스트가맹점",
        status: "ACTIVE",
        agent_id: testAgent.id,
      },
      create: {
        company_id: testCompany.id,
        agent_id: testAgent.id,
        merchant_code: "MCH-TEST-001",
        merchant_name: "테스트가맹점",
        status: "ACTIVE",
      },
    });

    // 9. 가맹점 테스트 유저 (MERCHANT_OWNER)
    console.log("  → merchant test user");
    const merchantPassword = await bcrypt.hash(seedPassword, 12);
    const merchantUser = await tx.users.upsert({
      where: { login_id: "merchant_test" },
      update: {
        password_hash: merchantPassword,
        status: "ACTIVE",
        failed_login_count: 0,
        locked_until: null,
        merchant_id: testMerchant.id,
      },
      create: {
        login_id: "merchant_test",
        password_hash: merchantPassword,
        name: "가맹점테스트",
        user_type: USER_TYPES.MERCHANT,
        status: "ACTIVE",
        merchant_id: testMerchant.id,
      },
    });

    const merchantOwnerRole = await tx.roles.findUniqueOrThrow({
      where: { name: ROLES.MERCHANT_OWNER },
    });
    await tx.user_roles.upsert({
      where: {
        user_id_role_id: {
          user_id: merchantUser.id,
          role_id: merchantOwnerRole.id,
        },
      },
      update: {},
      create: { user_id: merchantUser.id, role_id: merchantOwnerRole.id },
    });

    // 10. 대리점 테스트 유저 (AGENT_OWNER)
    console.log("  → agent test user");
    const agentPassword = await bcrypt.hash(seedPassword, 12);
    const agentUser = await tx.users.upsert({
      where: { login_id: "agent_test" },
      update: {
        password_hash: agentPassword,
        status: "ACTIVE",
        failed_login_count: 0,
        locked_until: null,
        agent_id: testAgent.id,
      },
      create: {
        login_id: "agent_test",
        password_hash: agentPassword,
        name: "대리점테스트",
        user_type: USER_TYPES.AGENT,
        status: "ACTIVE",
        agent_id: testAgent.id,
      },
    });

    const agentOwnerRole = await tx.roles.findUniqueOrThrow({
      where: { name: ROLES.AGENT_OWNER },
    });
    await tx.user_roles.upsert({
      where: {
        user_id_role_id: {
          user_id: agentUser.id,
          role_id: agentOwnerRole.id,
        },
      },
      update: {},
      create: { user_id: agentUser.id, role_id: agentOwnerRole.id },
    });

    // 11. 데모용 PG API 키 생성 (Checkout UI 테스트용)
    console.log("  → demo PG API key");
    const demoClientKey = "ck_test_demo_0000000000000000";
    const demoSecretKey =
      "test_sk_demo_0000000000000000000000000000000000000000000000000000";
    const demoSecretKeyPrefix = demoSecretKey.substring(0, 16);
    const demoSecretKeyHash = await bcrypt.hash(demoSecretKey, 12);

    await tx.pg_api_keys.upsert({
      where: { client_key: demoClientKey },
      update: {
        secret_key_hash: demoSecretKeyHash,
        secret_key_prefix: demoSecretKeyPrefix,
        is_active: true,
        merchant_id: testMerchant.id,
      },
      create: {
        merchant_id: testMerchant.id,
        client_key: demoClientKey,
        secret_key_hash: demoSecretKeyHash,
        secret_key_prefix: demoSecretKeyPrefix,
        is_active: true,
      },
    });
  });

  console.log("✅ Seeding complete!");
  console.log("   Admin:    login_id=admin");
  console.log("   Merchant: login_id=merchant_test");
  console.log("   Agent:    login_id=agent_test");
  console.log("   PG API:   clientKey=%s", "ck_test_demo_0000000000000000");
  console.log(
    "   PG API:   secretKey=%s",
    "test_sk_demo_0000000000000000000000000000000000000000000000000000",
  );
}

main()
  .catch((e: unknown) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
