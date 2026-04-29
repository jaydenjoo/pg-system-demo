// ============================================================
// PG Gateway — 웹훅 암호화 서비스 (SRP 분리)
// KMS 기반 secret 암호화/복호화 + HMAC-SHA256 서명 생성
// ============================================================

import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { KMS_SERVICE } from '../../security/kms/kms.interface';
import type { KmsService } from '../../security/kms/kms.interface';

const WEBHOOK_KMS_KEY_ID = 'webhook-secret';

@Injectable()
export class WebhookCryptoService {
  constructor(@Inject(KMS_SERVICE) private readonly kms: KmsService) {}

  /** secret 평문 → AES-256-GCM 암호화 → hex 반환 */
  async encryptSecret(plainSecret: string): Promise<string> {
    const encrypted = await this.kms.encrypt(
      Buffer.from(plainSecret, 'utf8'),
      WEBHOOK_KMS_KEY_ID,
    );
    return encrypted.toString('hex');
  }

  /** hex → 복호화 → secret 평문 반환 */
  async decryptSecret(encryptedHex: string): Promise<string> {
    const decrypted = await this.kms.decrypt(
      Buffer.from(encryptedHex, 'hex'),
      WEBHOOK_KMS_KEY_ID,
    );
    return decrypted.toString('utf8');
  }

  /** HMAC-SHA256 서명 생성 */
  generateSignature(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  /** HMAC-SHA256 서명 검증 (timing-safe comparison) */
  verifySignature(
    body: string,
    secret: string,
    receivedSignature: string,
  ): boolean {
    const expected = this.generateSignature(body, secret);
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(receivedSignature, 'hex');

    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  }
}
