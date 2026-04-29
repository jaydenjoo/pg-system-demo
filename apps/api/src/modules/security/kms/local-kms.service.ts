import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { KmsService } from "./kms.interface";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * 개발/로컬 환경용 KMS 구현
 * 프로덕션에서는 AWS KMS 또는 Vault 구현체로 교체
 */
@Injectable()
export class LocalKmsService implements KmsService, OnModuleInit {
  private readonly logger = new Logger(LocalKmsService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const key = this.getMasterKey();
    if (!/^[0-9a-f]{64}$/i.test(key)) {
      throw new Error(
        "ENCRYPTION_KEY must be a 64-character hex string (256-bit)",
      );
    }
  }

  async encrypt(plaintext: Buffer, _keyId: string): Promise<Buffer> {
    const key = Buffer.from(this.getMasterKey(), "hex");
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // iv(16) + authTag(16) + encrypted
    return Buffer.concat([iv, authTag, encrypted]);
  }

  async decrypt(ciphertext: Buffer, _keyId: string): Promise<Buffer> {
    const key = Buffer.from(this.getMasterKey(), "hex");
    const iv = ciphertext.subarray(0, IV_LENGTH);
    const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  async generateDataKey(
    _keyId: string,
  ): Promise<{ plaintext: Buffer; ciphertext: Buffer }> {
    const dataKey = crypto.randomBytes(32);
    const encryptedKey = await this.encrypt(dataKey, _keyId);
    return { plaintext: dataKey, ciphertext: encryptedKey };
  }

  async rotateKey(_keyId: string): Promise<string> {
    const newKeyId = crypto.randomUUID();
    // 로컬 환경: 새 키 ID만 발급 (실제 마스터키 교체는 환경변수 재설정으로 수행)
    // 프로덕션: AWS KMS/Vault에서 실제 키 로테이션 수행
    this.logger.log(
      `[LocalKMS] 키 로테이션 완료 (newKeyId=${newKeyId}). 로컬 환경에서는 ENCRYPTION_KEY 환경변수 교체 필요.`,
    );
    return newKeyId;
  }

  private getMasterKey(): string {
    const key = this.configService.get<string>("encryption.key");
    if (!key) {
      throw new Error("ENCRYPTION_KEY 환경변수가 설정되지 않았습니다");
    }
    return key;
  }
}
