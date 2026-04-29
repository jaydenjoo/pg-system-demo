/**
 * Mock 사용자 데이터 (Demo 전용).
 * docs/DEMO_SCENARIO.md 시드 계정과 동일.
 */

export interface MockUser {
  userId: string;
  loginId: string;
  password: string;
  userType: 'ADMIN' | 'AGENT' | 'MERCHANT';
  name: string;
  email: string;
  mfaEnabled: boolean;
  createdAt: string;
}

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
  },
];

export function findUserByCredentials(loginId: string, password: string): MockUser | null {
  return MOCK_USERS.find((u) => u.loginId === loginId && u.password === password) ?? null;
}

export function findUserById(userId: string): MockUser | null {
  return MOCK_USERS.find((u) => u.userId === userId) ?? null;
}
