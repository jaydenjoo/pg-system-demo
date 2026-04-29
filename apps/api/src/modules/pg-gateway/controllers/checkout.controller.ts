// ============================================================
// PG Gateway — 결제창 컨트롤러 (인증 불필요 — 공개 엔드포인트)
// SDK 클라이언트 사이드에서 clientKey로 결제 건 유효성 검증.
// secretKey/Basic Auth 불필요 — clientKey(공개키)만 사용.
// ============================================================
import {
  Controller,
  Get,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CheckoutVerifyService } from '../services/checkout-verify.service';
import {
  VerifyCheckoutQueryDto,
  VerifyCheckoutResponseDto,
} from '../dto/verify-checkout.dto';
import { ErrorResponseDto } from '../../../common/dto/error-response.dto';

/**
 * 결제창 공개 엔드포인트.
 * Basic Auth 가드를 적용하지 않음 — clientKey(공개키)로만 검증.
 * iframe에서 로드 시 결제 건 유효성을 확인하는 용도.
 */
@ApiTags('PG-Checkout')
@Controller('pg/v1/payments/checkout')
@ApiExtraModels(VerifyCheckoutResponseDto, ErrorResponseDto)
export class CheckoutController {
  constructor(
    private readonly checkoutVerifyService: CheckoutVerifyService,
  ) {}

  /** GET /pg/v1/payments/checkout/verify — 결제창 유효성 검증 */
  @Get('verify')
  @ApiOperation({
    summary: '결제창 유효성 검증 (공개)',
    description:
      'clientKey(공개키)와 paymentKey로 결제 건 유효성을 확인합니다. ' +
      'SDK 클라이언트에서 iframe 로드 시 호출합니다. Basic Auth 불필요.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '검증 성공 — 결제 정보 반환',
    type: VerifyCheckoutResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '유효하지 않은 clientKey 또는 이미 처리된 결제',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '결제 건 미존재',
    type: ErrorResponseDto,
  })
  async verify(@Query() query: VerifyCheckoutQueryDto) {
    const result = await this.checkoutVerifyService.verify(
      query.clientKey,
      query.paymentKey,
    );
    return { data: result };
  }
}
