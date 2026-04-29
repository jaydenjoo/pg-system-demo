import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecurityService } from '../../security/security.service';
import { KmsService, KMS_SERVICE } from '../../security/kms/kms.interface';
import type {
  CardTokenResult,
  TokenizeCardParams,
  DeactivateTokenParams,
} from '@pg-system/shared';

const KMS_KEY_ID = 'card-token-encryption';
const TOKEN_BYTE_LENGTH = 32; // 256-bit → 64자 hex
const MIN_CARD_LENGTH = 13;
const MAX_CARD_LENGTH = 19;

/**
 * 카드 토큰화 서비스 (PCI DSS 3.4)
 *
 * PAN(카드번호)을 AES-256-GCM으로 암호화 후 DB에 저장하고,
 * 무작위 토큰을 발급하여 시스템 내부에서 PAN 대신 사용한다.
 *
 * 비유: 호텔 금고에 여권을 맡기고, 금고 번호표(토큰)를 받는 것.
 * 번호표만으로는 여권 내용을 알 수 없고, 금고(KMS)를 열어야만 확인 가능.
 */
@Injectable()
export class CardTokenizationService {
  private readonly logger = new Logger(CardTokenizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(KMS_SERVICE) private readonly kmsService: KmsService,
    private readonly securityService: SecurityService,
  ) {}

  /**
   * 카드번호 → 토큰 변환 (동일 카드 재사용)
   */
  async tokenize(params: TokenizeCardParams): Promise<CardTokenResult> {
    const { cardNumber, merchantId, cardCompany, cardType, cardBrand, createdBy } = params;

    this.validateCardNumber(cardNumber);

    const cardBin = cardNumber.slice(0, 6);
    const lastFour = cardNumber.slice(-4);

    // 동일 카드 기존 토큰 확인 (가맹점+BIN+끝4자리)
    const existingToken = await this.findExistingToken(merchantId, cardBin, lastFour);
    if (existingToken) {
      this.logger.debug(`기존 토큰 재사용 (merchant=${merchantId}, bin=${cardBin}****${lastFour})`);
      return {
        token: existingToken.token,
        cardBin: existingToken.card_bin,
        lastFour: existingToken.last_four,
        cardCompany: existingToken.card_company,
        ...(existingToken.card_type != null && { cardType: existingToken.card_type }),
        ...(existingToken.card_brand != null && { cardBrand: existingToken.card_brand }),
        isNewToken: false,
      };
    }

    // PAN 암호화 (AES-256-GCM via KMS)
    const encryptedPan = await this.kmsService.encrypt(
      Buffer.from(cardNumber, 'utf-8'),
      KMS_KEY_ID,
    );

    // 고엔트로피 토큰 생성 (2^256)
    const token = crypto.randomBytes(TOKEN_BYTE_LENGTH).toString('hex');

    // DB 저장 (PAN 평문 미저장)
    await this.prisma.card_tokens.create({
      data: {
        token,
        encrypted_pan: encryptedPan,
        key_id: KMS_KEY_ID,
        card_bin: cardBin,
        last_four: lastFour,
        card_company: cardCompany,
        card_type: cardType ?? null,
        card_brand: cardBrand ?? null,
        merchant_id: merchantId,
        created_by: createdBy ?? null,
      },
    });

    // 감사 로그 (토큰 생성 기록, PAN 미포함)
    await this.securityService.writeAuditLog({
      ...(createdBy != null && { userId: createdBy }),
      action: 'CARD_TOKEN_CREATED',
      resourceType: 'card_tokens',
      resourceId: token,
      detail: { merchantId, cardBin, lastFour, cardCompany },
    });

    this.logger.log(`카드 토큰 생성 완료 (merchant=${merchantId}, bin=${cardBin}****${lastFour})`);

    return {
      token,
      cardBin,
      lastFour,
      cardCompany,
      ...(cardType != null && { cardType }),
      ...(cardBrand != null && { cardBrand }),
      isNewToken: true,
    };
  }

  /**
   * 토큰 → 카드번호 복호화 (VAN 전송 시에만 사용)
   */
  async detokenize(token: string): Promise<string> {
    const record = await this.prisma.card_tokens.findUnique({
      where: { token },
    });

    if (!record) {
      throw new NotFoundException('유효하지 않은 카드 토큰입니다');
    }

    if (!record.is_active) {
      throw new BadRequestException('비활성화된 카드 토큰입니다');
    }

    if (record.expires_at && record.expires_at < new Date()) {
      throw new BadRequestException('만료된 카드 토큰입니다');
    }

    const decryptedBuffer = await this.kmsService.decrypt(
      Buffer.from(record.encrypted_pan),
      record.key_id,
    );

    return decryptedBuffer.toString('utf-8');
  }

  /**
   * 기존 활성 토큰 조회 (가맹점+BIN+끝4자리)
   */
  async findExistingToken(
    merchantId: string,
    cardBin: string,
    lastFour: string,
  ): Promise<{
    token: string;
    card_bin: string;
    last_four: string;
    card_company: string;
    card_type: string | null;
    card_brand: string | null;
  } | null> {
    return this.prisma.card_tokens.findFirst({
      where: {
        merchant_id: merchantId,
        card_bin: cardBin,
        last_four: lastFour,
        is_active: true,
      },
      select: {
        token: true,
        card_bin: true,
        last_four: true,
        card_company: true,
        card_type: true,
        card_brand: true,
      },
    });
  }

  /**
   * 토큰 비활성화 (카드 폐기 등)
   */
  async deactivateToken(params: DeactivateTokenParams): Promise<void> {
    const { token, deactivatedBy } = params;

    const record = await this.prisma.card_tokens.findUnique({
      where: { token },
      select: { id: true, is_active: true, merchant_id: true },
    });

    if (!record) {
      throw new NotFoundException('유효하지 않은 카드 토큰입니다');
    }

    if (!record.is_active) {
      return; // 이미 비활성화 — 멱등 처리
    }

    await this.prisma.card_tokens.update({
      where: { token },
      data: {
        is_active: false,
        updated_by: deactivatedBy ?? null,
      },
    });

    await this.securityService.writeAuditLog({
      ...(deactivatedBy != null && { userId: deactivatedBy }),
      action: 'CARD_TOKEN_DEACTIVATED',
      resourceType: 'card_tokens',
      resourceId: token,
      detail: { merchantId: record.merchant_id },
    });

    this.logger.log(`카드 토큰 비활성화 완료 (token=${token.slice(0, 8)}...)`);
  }

  /**
   * 카드번호 유효성 검사 (13~19자리 숫자)
   * Luhn 체크는 VAN/카드사 역할이므로 생략
   */
  private validateCardNumber(cardNumber: string): void {
    if (!cardNumber || typeof cardNumber !== 'string') {
      throw new BadRequestException('카드번호가 누락되었습니다');
    }

    const digitsOnly = cardNumber.replace(/[\s-]/g, '');

    if (!/^\d+$/.test(digitsOnly)) {
      throw new BadRequestException('카드번호는 숫자만 포함해야 합니다');
    }

    if (digitsOnly.length < MIN_CARD_LENGTH || digitsOnly.length > MAX_CARD_LENGTH) {
      throw new BadRequestException(
        `카드번호는 ${MIN_CARD_LENGTH}~${MAX_CARD_LENGTH}자리여야 합니다`,
      );
    }
  }
}
