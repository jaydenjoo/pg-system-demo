/**
 * Demo용 mock 리스트 데이터.
 * 실제 백엔드 응답 형식과 동일한 구조 유지.
 */

export const MOCK_DASHBOARD_SUMMARY = {
  totalMerchants: 42,
  totalAgents: 8,
  transactionCount: 18342,
  totalTransactionAmount: '1284903500',
  totalSettlementAmount: '1126480200',
  totalDepositAmount: '1098230400',
  pendingSettlementCount: 6,
  unmatchedDepositCount: 2,
};

export const MOCK_TRANSACTION_STATS = {
  byStatus: [
    { status: 'APPROVED', count: 16720, totalAmount: '1180920400' },
    { status: 'CANCELLED', count: 845, totalAmount: '67430000' },
    { status: 'FAILED', count: 612, totalAmount: '36553100' },
    { status: 'PENDING', count: 165, totalAmount: '0' },
  ],
  byPaymentMethod: [
    { paymentMethod: 'CARD', count: 13420, totalAmount: '936490000' },
    { paymentMethod: 'BANK_TRANSFER', count: 3120, totalAmount: '241560200' },
    { paymentMethod: 'VIRTUAL_ACCOUNT', count: 1240, totalAmount: '78420300' },
    { paymentMethod: 'EASY_PAY', count: 562, totalAmount: '28433000' },
  ],
};

export const MOCK_SETTLEMENT_STATS = [
  { status: 'COMPLETED', count: 1102, totalNetAmount: '1042100000' },
  { status: 'PENDING', count: 6, totalNetAmount: '38420200' },
  { status: 'PROCESSING', count: 12, totalNetAmount: '45960000' },
];

export const MOCK_DAILY_TREND = [
  { date: '2026-04-22', count: 612, amount: '42100000' },
  { date: '2026-04-23', count: 728, amount: '52830000' },
  { date: '2026-04-24', count: 841, amount: '61920000' },
  { date: '2026-04-25', count: 902, amount: '67450000' },
  { date: '2026-04-26', count: 758, amount: '54320000' },
  { date: '2026-04-27', count: 689, amount: '48720000' },
  { date: '2026-04-28', count: 853, amount: '63810000' },
];

export const MOCK_TOP_MERCHANTS = [
  { merchantId: 'mch-001', merchantName: '카페 모카', merchantCode: 'M001', totalAmount: '128430000', transactionCount: 1842 },
  { merchantId: 'mch-002', merchantName: '서울 베이커리', merchantCode: 'M002', totalAmount: '102340000', transactionCount: 1421 },
  { merchantId: 'mch-003', merchantName: '동대문 의류', merchantCode: 'M003', totalAmount: '89720000', transactionCount: 982 },
  { merchantId: 'mch-004', merchantName: '강남 헬스장', merchantCode: 'M004', totalAmount: '76520000', transactionCount: 412 },
  { merchantId: 'mch-005', merchantName: '제주 레스토랑', merchantCode: 'M005', totalAmount: '64320000', transactionCount: 728 },
];

export const MOCK_TOP_AGENTS = [
  { agentId: 'agt-001', agentName: '서울대리점', agentCode: 'A001', totalCommission: '12420000', settlementCount: 248 },
  { agentId: 'agt-002', agentName: '부산대리점', agentCode: 'A002', totalCommission: '8430000', settlementCount: 152 },
  { agentId: 'agt-003', agentName: '인천대리점', agentCode: 'A003', totalCommission: '6210000', settlementCount: 98 },
];

export const MOCK_MERCHANTS = MOCK_TOP_MERCHANTS.map((m, i) => ({
  id: m.merchantId,
  merchantCode: m.merchantCode,
  merchantName: m.merchantName,
  businessNumber: `123-45-${String(67890 + i).padStart(5, '0')}`,
  representative: ['김철수', '이영희', '박민수', '최지영', '정은재'][i],
  status: 'ACTIVE' as const,
  agentId: 'agt-001',
  agentName: '서울대리점',
  contractDate: '2025-12-01',
  monthlyVolume: m.totalAmount,
  createdAt: '2025-12-01T00:00:00.000Z',
}));

export const MOCK_AGENTS = MOCK_TOP_AGENTS.map((a, i) => ({
  id: a.agentId,
  agentCode: a.agentCode,
  agentName: a.agentName,
  representative: ['홍길동', '강감찬', '이순신'][i],
  contactNumber: `010-${String(1000 + i).padStart(4, '0')}-${String(5000 + i).padStart(4, '0')}`,
  status: 'ACTIVE' as const,
  merchantCount: 14 - i * 3,
  totalCommission: a.totalCommission,
  contractDate: '2025-11-01',
  createdAt: '2025-11-01T00:00:00.000Z',
}));

export const MOCK_TRANSACTIONS = Array.from({ length: 25 }, (_, i) => {
  const merchant = MOCK_MERCHANTS[i % MOCK_MERCHANTS.length];
  const statuses = ['APPROVED', 'APPROVED', 'APPROVED', 'CANCELLED', 'PENDING'] as const;
  const methods = ['CARD', 'BANK_TRANSFER', 'VIRTUAL_ACCOUNT', 'EASY_PAY'] as const;
  const baseDate = new Date('2026-04-29T10:00:00Z').getTime();
  return {
    id: `tx-${String(i + 1).padStart(4, '0')}`,
    transactionId: `T${20260429}${String(i + 1001).padStart(6, '0')}`,
    merchantId: merchant.id,
    merchantName: merchant.merchantName,
    amount: String(10000 + (i % 7) * 5000 + (i * 730) % 25000),
    paymentMethod: methods[i % methods.length],
    status: statuses[i % statuses.length],
    customerName: `고객${i + 1}`,
    approvedAt: new Date(baseDate - i * 1000 * 60 * 17).toISOString(),
    createdAt: new Date(baseDate - i * 1000 * 60 * 17).toISOString(),
  };
});

export const MOCK_DEPOSITS = Array.from({ length: 10 }, (_, i) => ({
  id: `dep-${String(i + 1).padStart(4, '0')}`,
  bankName: ['신한은행', '국민은행', '우리은행', 'KEB하나은행'][i % 4],
  accountNumber: `110-${String(123 + i).padStart(3, '0')}-${String(456789 + i).padStart(6, '0')}`,
  amount: String(500000 + (i * 234567) % 9500000),
  depositorName: ['주식회사ABC', '카페모카', '서울베이커리', '동대문의류'][i % 4],
  matched: i % 3 !== 0,
  matchedTransactionId: i % 3 !== 0 ? `tx-${String((i % 25) + 1).padStart(4, '0')}` : null,
  depositedAt: new Date(Date.now() - i * 1000 * 60 * 60 * 6).toISOString(),
  createdAt: new Date(Date.now() - i * 1000 * 60 * 60 * 6).toISOString(),
}));

export const MOCK_SETTLEMENTS = Array.from({ length: 10 }, (_, i) => {
  const merchant = MOCK_MERCHANTS[i % MOCK_MERCHANTS.length];
  return {
    id: `stl-${String(i + 1).padStart(4, '0')}`,
    settlementCode: `S${20260429}${String(i + 100).padStart(4, '0')}`,
    merchantId: merchant.id,
    merchantName: merchant.merchantName,
    grossAmount: String(2400000 + i * 120000),
    feeAmount: String(72000 + i * 3600),
    netAmount: String(2328000 + i * 116400),
    status: i < 6 ? 'COMPLETED' : i < 8 ? 'PROCESSING' : 'PENDING',
    settlementDate: '2026-04-29',
    createdAt: new Date(Date.now() - i * 1000 * 60 * 60 * 24).toISOString(),
  };
});

export const MOCK_PG_MARGINS = [
  { id: 'pgm-001', merchantId: 'mch-001', merchantName: '카페 모카', cardRate: '2.8', bankRate: '0.8', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'pgm-002', merchantId: 'mch-002', merchantName: '서울 베이커리', cardRate: '2.7', bankRate: '0.8', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'pgm-003', merchantId: 'mch-003', merchantName: '동대문 의류', cardRate: '2.9', bankRate: '0.9', createdAt: '2026-01-01T00:00:00.000Z' },
];

export const MOCK_SYSTEM_CODES = [
  { id: 'sc-001', codeGroup: 'PAYMENT_METHOD', code: 'CARD', name: '카드결제', description: '신용카드/체크카드', sortOrder: 1, active: true },
  { id: 'sc-002', codeGroup: 'PAYMENT_METHOD', code: 'BANK_TRANSFER', name: '계좌이체', description: '실시간 계좌이체', sortOrder: 2, active: true },
  { id: 'sc-003', codeGroup: 'PAYMENT_METHOD', code: 'VIRTUAL_ACCOUNT', name: '가상계좌', description: '가상계좌 입금', sortOrder: 3, active: true },
  { id: 'sc-004', codeGroup: 'PAYMENT_METHOD', code: 'EASY_PAY', name: '간편결제', description: '카카오/네이버페이 등', sortOrder: 4, active: true },
  { id: 'sc-005', codeGroup: 'TRANSACTION_STATUS', code: 'APPROVED', name: '승인', description: '결제 승인 완료', sortOrder: 1, active: true },
  { id: 'sc-006', codeGroup: 'TRANSACTION_STATUS', code: 'CANCELLED', name: '취소', description: '결제 취소', sortOrder: 2, active: true },
  { id: 'sc-007', codeGroup: 'TRANSACTION_STATUS', code: 'FAILED', name: '실패', description: '결제 실패', sortOrder: 3, active: true },
];

export const MOCK_USERS_LIST = [
  { id: 'mock-admin-001', loginId: 'admin', name: '시스템 관리자', email: 'admin@pg-demo.local', userType: 'ADMIN' as const, status: 'ACTIVE' as const, lastLoginAt: '2026-04-28T15:30:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'mock-agent-001', loginId: 'agent_test', name: '테스트 대리점', email: 'agent@pg-demo.local', userType: 'AGENT' as const, status: 'ACTIVE' as const, lastLoginAt: '2026-04-28T11:15:00.000Z', createdAt: '2026-01-02T00:00:00.000Z' },
  { id: 'mock-merchant-001', loginId: 'merchant_test', name: '테스트 가맹점', email: 'merchant@pg-demo.local', userType: 'MERCHANT' as const, status: 'ACTIVE' as const, lastLoginAt: '2026-04-29T08:45:00.000Z', createdAt: '2026-01-03T00:00:00.000Z' },
];

export const MOCK_ROLES = [
  { id: 'role-001', code: 'SUPER_ADMIN', name: '슈퍼관리자', description: '전체 권한', permissionCount: 42 },
  { id: 'role-002', code: 'ADMIN', name: '관리자', description: '일반 관리자 권한', permissionCount: 28 },
  { id: 'role-003', code: 'AGENT', name: '대리점', description: '대리점 운영 권한', permissionCount: 14 },
  { id: 'role-004', code: 'MERCHANT', name: '가맹점', description: '가맹점 운영 권한', permissionCount: 8 },
];

export function paginate<T>(items: T[], page = 1, limit = 20): {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
} {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const end = start + limit;
  return {
    data: items.slice(start, end),
    meta: { total, page, limit, totalPages },
  };
}

export function readPagination(searchParams: URLSearchParams): { page: number; limit: number } {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10) || 20));
  return { page, limit };
}
