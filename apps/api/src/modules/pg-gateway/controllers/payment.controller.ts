// ============================================================
// PG Gateway — 결제 컨트롤러 (가맹점 Basic Auth 인증)
// ============================================================
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBasicAuth,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PgBasicAuthGuard } from '../guards/pg-basic-auth.guard';
import type { PgAuthenticatedRequest } from '../guards/pg-basic-auth.guard';
import { IpWhitelistGuard } from '../guards/ip-whitelist.guard';
import { PaymentOrderService } from '../services/payment-order.service';
import { PaymentConfirmService } from '../services/payment-confirm.service';
import { PaymentCancelService } from '../services/payment-cancel.service';
import { CreatePaymentOrderDto } from '../dto/create-payment-order.dto';
import { ConfirmPaymentDto } from '../dto/confirm-payment.dto';
import { CancelPaymentDto } from '../dto/cancel-payment.dto';
import { PaymentOrderResponseDto } from '../dto/payment-order-response.dto';
import { ErrorResponseDto } from '../../../common/dto/error-response.dto';

/**
 * @description PG 게이트웨이 결제 컨트롤러 (가맹점용). 결제 주문 생성·승인 확정·취소·조회 엔드포인트 제공.
 * Basic Auth(API Key + Secret Key) + IP 화이트리스트 이중 인증 적용.
 * 결제 플로우: 주문 생성(READY) → 승인 확정(APPROVED) → 취소 가능(CANCELLED).
 * 가맹점 격리(merchantId)로 다른 가맹점 결제 데이터 접근 불가.
 * @security PCI DSS 6.5 - 결제 데이터 무결성 및 금액 변조 방지
 */
@ApiTags('PG-Payment')
@ApiBasicAuth('PG-Basic')
@Controller('pg/v1/payments')
@UseGuards(PgBasicAuthGuard, IpWhitelistGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } }) // 결제 엔드포인트: IP당 분당 10회 (PCI DSS)
@ApiExtraModels(PaymentOrderResponseDto, ErrorResponseDto)
export class PaymentController {
  constructor(
    private readonly paymentOrderService: PaymentOrderService,
    private readonly paymentConfirmService: PaymentConfirmService,
    private readonly paymentCancelService: PaymentCancelService,
  ) {}

  /** POST /pg/v1/payments — 결제 주문 생성 */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '결제 주문 생성' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '결제 주문 생성 성공',
    type: PaymentOrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '인증 실패 (Basic Auth)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'IP 화이트리스트 미포함',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '유효하지 않은 요청 (DTO 검증 실패)',
    type: ErrorResponseDto,
  })
  async createPaymentOrder(
    @Req() req: PgAuthenticatedRequest,
    @Body() dto: CreatePaymentOrderDto,
  ) {
    const result = await this.paymentOrderService.createPaymentOrder(
      dto,
      req.pgMerchantId,
      req.pgApiKeyId,
    );
    return { data: result };
  }

  /** POST /pg/v1/payments/confirm — 결제 승인 확정 */
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '결제 승인 확정' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '결제 승인 확정 성공',
    type: PaymentOrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '인증 실패 (Basic Auth)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'IP 화이트리스트 미포함',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '유효하지 않은 요청 (금액 불일치 등)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: '이미 승인된 결제',
    type: ErrorResponseDto,
  })
  async confirmPayment(
    @Req() req: PgAuthenticatedRequest,
    @Body() dto: ConfirmPaymentDto,
  ) {
    const result = await this.paymentConfirmService.confirm(dto, req.pgMerchantId);
    return { data: result };
  }

  /** POST /pg/v1/payments/:paymentKey/cancel — 결제 취소 */
  @Post(':paymentKey/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '결제 취소' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '결제 취소 성공',
    type: PaymentOrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '인증 실패 (Basic Auth)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'IP 화이트리스트 미포함',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '유효하지 않은 요청 (취소 금액 초과 등)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '결제 건 미존재',
    type: ErrorResponseDto,
  })
  async cancelPayment(
    @Req() req: PgAuthenticatedRequest,
    @Param('paymentKey') paymentKey: string,
    @Body() dto: CancelPaymentDto,
  ) {
    const result = await this.paymentCancelService.cancel(paymentKey, dto, req.pgMerchantId);
    return { data: result };
  }

  /**
   * GET /pg/v1/payments/orders/:orderId — 주문번호로 결제 조회
   * ⚠️ 라우트 순서: "orders/:orderId"가 ":paymentKey"보다 먼저 정의해야 함
   */
  @Get('orders/:orderId')
  @ApiOperation({ summary: '주문번호로 결제 조회' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '결제 조회 성공',
    type: PaymentOrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '인증 실패 (Basic Auth)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'IP 화이트리스트 미포함',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '결제 건 미존재',
    type: ErrorResponseDto,
  })
  async getByOrderId(
    @Req() req: PgAuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    const result = await this.paymentOrderService.getByOrderId(orderId, req.pgMerchantId);
    return { data: result };
  }

  /** GET /pg/v1/payments/:paymentKey — paymentKey로 결제 조회 */
  @Get(':paymentKey')
  @ApiOperation({ summary: '결제키로 결제 조회' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '결제 조회 성공',
    type: PaymentOrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '인증 실패 (Basic Auth)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'IP 화이트리스트 미포함',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '결제 건 미존재',
    type: ErrorResponseDto,
  })
  async getByPaymentKey(
    @Req() req: PgAuthenticatedRequest,
    @Param('paymentKey') paymentKey: string,
  ) {
    const result = await this.paymentOrderService.getByPaymentKey(
      paymentKey,
      req.pgMerchantId,
    );
    return { data: result };
  }
}
