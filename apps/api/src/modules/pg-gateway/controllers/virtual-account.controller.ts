// ============================================================
// PG Gateway — 가상계좌 컨트롤러 (Phase 7)
// ============================================================
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../common/dto/error-response.dto';
import { PgBasicAuthGuard } from '../guards/pg-basic-auth.guard';
import type { PgAuthenticatedRequest } from '../guards/pg-basic-auth.guard';
import { IpWhitelistGuard } from '../guards/ip-whitelist.guard';
import { VirtualAccountService } from '../services/virtual-account.service';
import { VirtualAccountConfirmDto, DepositCallbackDto } from '../dto/virtual-account.dto';

/**
 * @description PG 게이트웨이 가상계좌 컨트롤러. 가상계좌 발급 확정 및 입금 콜백 수신 엔드포인트 제공.
 * 발급 확정: Basic Auth + IP 화이트리스트 인증, 입금 콜백: 은행 서버 전용 공개 엔드포인트.
 * 입금 콜백 수신 시 자동으로 결제 상태를 DEPOSITED로 전이.
 * @security PCI DSS 6.5 - 가상계좌 입금 데이터 무결성 및 콜백 인증
 */
@ApiTags('PG-VirtualAccount')
@Controller('pg/v1/virtual-account')
export class VirtualAccountController {
  constructor(private readonly virtualAccountService: VirtualAccountService) {}

  /**
   * POST /pg/v1/virtual-account/confirm — 가상계좌 발급 확정
   * 가맹점 Basic Auth 인증 필요.
   */
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PgBasicAuthGuard, IpWhitelistGuard)
  @ApiBasicAuth('PG-Basic')
  @ApiOperation({ summary: '가상계좌 발급 확정' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '가상계좌 발급 확정 성공 (계좌번호, 입금기한 포함)',
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
  async confirmVirtualAccount(
    @Req() req: PgAuthenticatedRequest,
    @Body() dto: VirtualAccountConfirmDto,
  ) {
    const result = await this.virtualAccountService.issueVirtualAccount(dto, req.pgMerchantId);
    return { data: result };
  }

  /**
   * POST /pg/v1/virtual-account/deposit-callback — Mock 은행 입금 콜백
   * 인증 없음 (Mock 은행에서 호출).
   */
  @Post('deposit-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mock 은행 입금 콜백' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '입금 콜백 처리 성공',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '유효하지 않은 요청 (계좌번호 미존재 등)',
    type: ErrorResponseDto,
  })
  async depositCallback(@Body() dto: DepositCallbackDto) {
    const result = await this.virtualAccountService.handleDepositCallback(dto);
    return { data: result };
  }
}
