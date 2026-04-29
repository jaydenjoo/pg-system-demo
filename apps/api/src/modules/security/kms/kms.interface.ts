/**
 * KMS (Key Management Service) 추상화 인터페이스
 * AWS KMS, HashiCorp Vault 등 외부 KMS 전환 시 이 인터페이스만 구현
 */
export interface KmsService {
  encrypt(plaintext: Buffer, keyId: string): Promise<Buffer>;
  decrypt(ciphertext: Buffer, keyId: string): Promise<Buffer>;
  generateDataKey(
    keyId: string,
  ): Promise<{ plaintext: Buffer; ciphertext: Buffer }>;
  rotateKey(keyId: string): Promise<string>;
}

export const KMS_SERVICE = Symbol("KMS_SERVICE");
