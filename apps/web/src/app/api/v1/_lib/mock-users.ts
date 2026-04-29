/**
 * Mock 사용자 데이터 (Demo 전용).
 * docs/DEMO_SCENARIO.md 시드 계정과 동일.
 * permissions/user_roles는 packages/shared seed-data.ts ROLE_PERMISSION_MAP과 매칭.
 */
import { PERMISSIONS, ROLES } from '@pg-system/shared';

export interface MockUser {
  userId: string;
  loginId: string;
  password: string;
  userType: 'ADMIN' | 'AGENT' | 'MERCHANT';
  name: string;
  email: string;
  mfaEnabled: boolean;
  createdAt: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

const ADMIN_PERMISSIONS = Object.values(PERMISSIONS);

const AGENT_OWNER_PERMISSIONS = [
  PERMISSIONS.AGENT_READ,
  PERMISSIONS.MERCHANT_READ,
  PERMISSIONS.TRANSACTION_READ,
  PERMISSIONS.SETTLEMENT_READ,
  PERMISSIONS.COMMISSION_READ,
  PERMISSIONS.PG_WEBHOOK_MANAGE,
  PERMISSIONS.DASHBOARD_READ,
];

const MERCHANT_OWNER_PERMISSIONS = [
  PERMISSIONS.MERCHANT_READ,
  PERMISSIONS.TRANSACTION_READ,
  PERMISSIONS.SETTLEMENT_READ,
  PERMISSIONS.COMMISSION_READ,
  PERMISSIONS.PG_WEBHOOK_MANAGE,
  PERMISSIONS.DASHBOARD_READ,
];

export const MOCK_USERS: MockUser[] = [
  {
    userId: 'mock-admin-001',
    loginId: 'admin',
    password: 'Admin1234!@',
    userType: 'ADMIN',
    name: '시스템 관리자',
    email: 'admin@pg-demo.local',
    mfaEnabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    roleId: 'role-001',
    roleName: ROLES.SUPER_ADMIN,
    permissions: ADMIN_PERMISSIONS,
  },
  {
    userId: 'mock-agent-001',
    loginId: 'agent_test',
    password: 'Agent1234!@',
    userType: 'AGENT',
    name: '테스트 대리점',
    email: 'agent@pg-demo.local',
    mfaEnabled: false,
    createdAt: '2026-01-02T00:00:00.000Z',
    roleId: 'role-005',
    roleName: ROLES.AGENT_OWNER,
    permissions: AGENT_OWNER_PERMISSIONS,
  },
  {
    userId: 'mock-merchant-001',
    loginId: 'merchant_test',
    password: 'Merchant1234!@',
    userType: 'MERCHANT',
    name: '테스트 가맹점',
    email: 'merchant@pg-demo.local',
    mfaEnabled: false,
    createdAt: '2026-01-03T00:00:00.000Z',
    roleId: 'role-007',
    roleName: ROLES.MERCHANT_OWNER,
    permissions: MERCHANT_OWNER_PERMISSIONS,
  },
];

export function findUserByCredentials(loginId: string, password: string): MockUser | null {
  return MOCK_USERS.find((u) => u.loginId === loginId && u.password === password) ?? null;
}

export function findUserById(userId: string): MockUser | null {
  return MOCK_USERS.find((u) => u.userId === userId) ?? null;
}

/** Backend의 snake_case User 응답 형태로 직렬화 */
export function serializeUser(user: MockUser): Record<string, unknown> {
  return {
    id: user.userId,
    login_id: user.loginId,
    name: user.name,
    email: user.email,
    phone: null,
    user_type: user.userType,
    org_id: null,
    status: 'ACTIVE',
    mfa_enabled: user.mfaEnabled,
    last_login_at: new Date().toISOString(),
    created_at: user.createdAt,
    updated_at: user.createdAt,
    user_roles: [
      {
        assigned_at: user.createdAt,
        roles: {
          id: user.roleId,
          name: user.roleName,
          description: `${user.roleName} 데모 역할`,
          user_type: user.userType,
        },
      },
    ],
    permissions: user.permissions,
  };
}
