// ============================================================
// PG Gateway — API 키 발급/관리 서비스
// ============================================================
import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../prisma/prisma.service';
import { ERROR_CODES, CACHE_TTL } from '@pg-system/shared';
import type { CreateApiKeyResponse } from '@pg-system/shared';
import type { CreateApiKeyDto } from '../dto/create-api-key.dto';

const BCRYPT_ROUNDS = 12;

export interface ValidatedApiKey {
  id: string;
  merchantId: string;
  clientKey: string;
}

export interface ApiKeyListItem {
  id: string;
  clientKey: string;
  isActive: boolean;
  webhookUrl: string | null;
  allowedIps: string[];
  createdAt: Date;
}

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * 가맹점용 API 키 발급.
   * secretKey는 최초 1회만 평문 반환 — 이후 절대 복호화 불가.
   */
  async createApiKey(dto: CreateApiKeyDto): Promise<CreateApiKeyResponse> {
    // 활성 가맹점 존재 확인
    const merchant = await this.prisma.merchants.findFirst({
      where: { id: dto.merchantId, status: 'ACTIVE' },
    });
    if (!merchant) {
      throw new NotFoundException({
        code: ERROR_CODES.MERCHANT_001,
        message: '가맹점을 찾을 수 없습니다',
      });
    }

    // 키 생성: crypto.randomBytes 사용 (Math.random 금지 — PCI DSS 6.2.4)
    const clientKey = `ck_live_${crypto.randomBytes(16).toString('hex')}`; // 8+32=40 chars
    const secretKey = `sk_live_${crypto.randomBytes(28).toString('hex')}`; // 8+56=64 chars

    // 앞 16자리를 prefix로 저장 (DB 프리필터용 — bcrypt 전 후보군 축소)
    const secretKeyPrefix = secretKey.substring(0, 16);
    const secretKeyHash = await bcrypt.hash(secretKey, BCRYPT_ROUNDS);

    await this.prisma.pg_api_keys.create({
      data: {
        merchant_id: dto.merchantId,
        client_key: clientKey,
        secret_key_hash: secretKeyHash,
        secret_key_prefix: secretKeyPrefix,
        webhook_url: dto.webhookUrl ?? null,
        webhook_secret: dto.webhookSecret ?? null,
      },
    });

    // Invalidate cache for this prefix
    await this.cache.del(`api_key_prefix:${secretKeyPrefix}`);

    const response: CreateApiKeyResponse = { clientKey, secretKey };
    if (dto.webhookUrl !== undefined) {
      response.webhookUrl = dto.webhookUrl;
    }
    return response; // secretKey는 최초 1회만 반환 — DB에 평문 미저장
  }

  /**
   * Basic Auth 헤더의 secretKey 검증.
   * prefix로 후보를 좁힌 뒤 bcrypt 비교로 정확도 확인.
   */
  async validateSecretKey(secretKey: string): Promise<ValidatedApiKey | null> {
    if (secretKey.length < 16) return null;

    const prefix = secretKey.substring(0, 16);
    const cacheKey = `api_key_prefix:${prefix}`;

    // Check cache first
    let candidates = await this.cache.get<
      Array<{
        id: string;
        merchant_id: string;
        client_key: string;
        secret_key_hash: string;
      }>
    >(cacheKey);

    // If cache miss, query DB
    if (candidates === undefined) {
      candidates = await this.prisma.pg_api_keys.findMany({
        where: { secret_key_prefix: prefix, is_active: true },
      });
      // Store in cache for next requests
      await this.cache.set(cacheKey, candidates, CACHE_TTL.API_KEY_PREFIX);
    }

    for (const candidate of candidates) {
      const isMatch = await bcrypt.compare(secretKey, candidate.secret_key_hash);
      if (isMatch) {
        return {
          id: candidate.id,
          merchantId: candidate.merchant_id,
          clientKey: candidate.client_key,
        };
      }
    }

    return null;
  }

  /**
   * API 키 비활성화 (소프트 폐기).
   */
  async revokeApiKey(id: string, merchantId: string): Promise<void> {
    const key = await this.prisma.pg_api_keys.findFirst({
      where: { id, merchant_id: merchantId },
    });
    if (!key) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'API 키를 찾을 수 없습니다',
      });
    }

    await this.prisma.pg_api_keys.update({
      where: { id },
      data: { is_active: false },
    });

    // Invalidate cache for this prefix
    await this.cache.del(`api_key_prefix:${key.secret_key_prefix}`);
  }

  /**
   * 가맹점의 API 키 목록 조회.
   * secretKey는 절대 반환하지 않음.
   */
  async listApiKeys(merchantId: string): Promise<ApiKeyListItem[]> {
    const keys = await this.prisma.pg_api_keys.findMany({
      where: { merchant_id: merchantId },
      orderBy: { created_at: 'desc' },
    });

    return keys.map((k) => ({
      id: k.id,
      clientKey: k.client_key,
      isActive: k.is_active,
      webhookUrl: k.webhook_url,
      allowedIps: k.allowed_ips,
      createdAt: k.created_at,
    }));
  }

  /**
   * API 키의 IP 화이트리스트 업데이트 (PCI DSS 1.3.2).
   * 빈 배열 전달 시 IP 제한 해제.
   */
  async updateAllowedIps(
    id: string,
    merchantId: string,
    allowedIps: string[],
  ): Promise<void> {
    const key = await this.prisma.pg_api_keys.findFirst({
      where: { id, merchant_id: merchantId },
    });
    if (!key) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'API 키를 찾을 수 없습니다',
      });
    }

    await this.prisma.pg_api_keys.update({
      where: { id },
      data: { allowed_ips: allowedIps },
    });

    // Invalidate cache for this prefix
    await this.cache.del(`api_key_prefix:${key.secret_key_prefix}`);
  }
}
