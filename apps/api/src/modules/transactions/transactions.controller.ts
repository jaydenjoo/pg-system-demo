import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from "@nestjs/swagger";
import { TransactionsService } from "./transactions.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { PERMISSIONS } from "@pg-system/shared";
import { OwnershipInterceptor } from "../../common/interceptors/ownership.interceptor";
import { TransactionListQueryDto } from "./dto/transaction-list-query.dto";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { CancelTransactionDto } from "./dto/cancel-transaction.dto";

/**
 * @description 거래(Transaction) 관리 컨트롤러. 거래 목록 조회·생성·상세·취소 엔드포인트 제공.
 * JWT 인증 + 권한 가드 적용 (TRANSACTION_READ/CREATE/CANCEL).
 * 거래 금액은 BigInt(원 단위), 상태 전이 규칙(PENDING→APPROVED/FAILED/CANCELLED) 적용.
 * @security PCI DSS 6.5 - 거래 데이터 무결성 보장
 */
@Controller("api/v1/transactions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(OwnershipInterceptor)
@ApiTags("Transactions")
@ApiBearerAuth("JWT")
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  @ApiOperation({ summary: "거래 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "거래 목록 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 403,
    description: "권한 부족",
  })
  async findAll(@Query() query: TransactionListQueryDto) {
    return this.transactionsService.findAll(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TRANSACTION_CREATE)
  @ApiOperation({ summary: "새 거래 생성" })
  @ApiResponse({
    status: 201,
    description: "거래 생성 성공",
  })
  @ApiResponse({
    status: 400,
    description: "유효하지 않은 요청",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 403,
    description: "권한 부족",
  })
  async create(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.transactionsService.create(dto, user.sub) };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  @ApiOperation({ summary: "거래 상세 조회" })
  @ApiResponse({
    status: 200,
    description: "거래 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 403,
    description: "권한 부족",
  })
  @ApiResponse({
    status: 404,
    description: "거래를 찾을 수 없음",
  })
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.transactionsService.findOne(id) };
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.TRANSACTION_CANCEL)
  @ApiOperation({ summary: "거래 취소" })
  @ApiResponse({
    status: 200,
    description: "거래 취소 성공",
  })
  @ApiResponse({
    status: 400,
    description: "유효하지 않은 요청",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 403,
    description: "권한 부족",
  })
  @ApiResponse({
    status: 404,
    description: "거래를 찾을 수 없음",
  })
  async cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CancelTransactionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.transactionsService.cancel(id, dto, user.sub) };
  }
}
