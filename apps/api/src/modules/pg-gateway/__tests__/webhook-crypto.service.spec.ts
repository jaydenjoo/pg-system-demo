// ============================================================
// WebhookCryptoService 단위 테스트
// KMS 암호화/복호화 + HMAC-SHA256 서명 생성 검증
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { WebhookCryptoService } from '../services/webhook-crypto.service';
import { KMS_SERVICE } from '../../security/kms/kms.interface';

// ---- KMS Mock ----
const PLAIN_SECRET = 'whsec_test_secret_key_for_unit_test';
const ENCRYPTED_BUFFER = Buffer.from('encrypted-' + PLAIN_SECRET);

const mockKms = {
  encrypt: jest.fn().mockResolvedValue(ENCRYPTED_BUFFER),
  decrypt: jest.fn().mockResolvedValue(Buffer.from(PLAIN_SECRET, 'utf8')),
  generateDataKey: jest.fn(),
  rotateKey: jest.fn(),
};

// ============================================================
describe('WebhookCryptoService', () => {
  let service: WebhookCryptoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookCryptoService,
        { provide: KMS_SERVICE, useValue: mockKms },
      ],
    }).compile();

    service = module.get<WebhookCryptoService>(WebhookCryptoService);
    jest.clearAllMocks();
    mockKms.encrypt.mockResolvedValue(ENCRYPTED_BUFFER);
    mockKms.decrypt.mockResolvedValue(Buffer.from(PLAIN_SECRET, 'utf8'));
  });

  // ── TC-C1: encryptSecret — KMS encrypt 호출 + hex 반환 ──
  it('TC-C1: encryptSecret → kms.encrypt 호출 후 hex 문자열 반환', async () => {
    const result = await service.encryptSecret(PLAIN_SECRET);

    expect(mockKms.encrypt).toHaveBeenCalledWith(
      Buffer.from(PLAIN_SECRET, 'utf8'),
      'webhook-secret',
    );
    expect(result).toBe(ENCRYPTED_BUFFER.toString('hex'));
    expect(typeof result).toBe('string');
    // hex 형식 검증 (짝수 길이, 16진수 문자만)
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  // ── TC-C2: decryptSecret — KMS decrypt 호출 + utf8 문자열 반환 ──
  it('TC-C2: decryptSecret → kms.decrypt 호출 후 평문 문자열 반환', async () => {
    const encryptedHex = ENCRYPTED_BUFFER.toString('hex');
    const result = await service.decryptSecret(encryptedHex);

    expect(mockKms.decrypt).toHaveBeenCalledWith(
      Buffer.from(encryptedHex, 'hex'),
      'webhook-secret',
    );
    expect(result).toBe(PLAIN_SECRET);
    expect(typeof result).toBe('string');
  });

  // ── TC-C3: generateSignature — HMAC-SHA256 수학적 검증 ──
  it('TC-C3: generateSignature → HMAC-SHA256 값 일치', () => {
    const body = JSON.stringify({
      eventType: 'PAYMENT_STATUS_CHANGED',
      createdAt: '2024-01-01T12:00:00.000Z',
      data: { paymentKey: 'pk-1', orderId: 'ORD-1', status: 'DONE', amount: 10000 },
    });
    const secret = 'test-webhook-secret-key';

    const result = service.generateSignature(body, secret);

    // 동일한 방법으로 직접 계산하여 비교
    const expected = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    expect(result).toBe(expected);
    // hex 64자 (SHA-256 출력)
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  // ── TC-C4: generateSignature — 동일 입력 → 동일 출력 (결정론적) ──
  it('TC-C4: 동일한 body + secret → 항상 동일한 서명 반환', () => {
    const body = '{"test":"value"}';
    const secret = 'same-secret';

    const sig1 = service.generateSignature(body, secret);
    const sig2 = service.generateSignature(body, secret);

    expect(sig1).toBe(sig2);
  });

  // ── TC-C5: generateSignature — 다른 secret → 다른 서명 ──
  it('TC-C5: 다른 secret → 다른 서명 생성', () => {
    const body = '{"test":"value"}';

    const sig1 = service.generateSignature(body, 'secret-A');
    const sig2 = service.generateSignature(body, 'secret-B');

    expect(sig1).not.toBe(sig2);
  });

  // ── TC-C6: verifySignature — 올바른 서명 → true ──
  it('TC-C6: verifySignature → 올바른 서명은 true 반환', () => {
    const body = '{"paymentKey":"pk-1","amount":10000}';
    const secret = 'whsec_verify_test';

    const signature = service.generateSignature(body, secret);
    const result = service.verifySignature(body, secret, signature);

    expect(result).toBe(true);
  });

  // ── TC-C7: verifySignature — 변조된 서명 → false ──
  it('TC-C7: verifySignature → 변조된 서명은 false 반환', () => {
    const body = '{"paymentKey":"pk-1","amount":10000}';
    const secret = 'whsec_verify_test';

    const signature = service.generateSignature(body, secret);
    // 서명의 마지막 문자를 변조
    const tampered = signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0');
    const result = service.verifySignature(body, secret, tampered);

    expect(result).toBe(false);
  });

  // ── TC-C8: verifySignature — 다른 secret으로 생성된 서명 → false ──
  it('TC-C8: verifySignature → 다른 secret의 서명은 false 반환', () => {
    const body = '{"paymentKey":"pk-1","amount":10000}';

    const signature = service.generateSignature(body, 'secret-A');
    const result = service.verifySignature(body, 'secret-B', signature);

    expect(result).toBe(false);
  });

  // ── TC-C9: verifySignature — 길이 불일치 서명 → false ──
  it('TC-C9: verifySignature → 길이가 다른 서명은 false 반환', () => {
    const body = '{"test":"value"}';
    const secret = 'whsec_test';

    const result = service.verifySignature(body, secret, 'abcd');

    expect(result).toBe(false);
  });
});
