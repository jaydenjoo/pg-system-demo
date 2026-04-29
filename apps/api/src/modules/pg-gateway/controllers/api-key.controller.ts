// ============================================================
// PG Gateway — API 키 관리 컨트롤러 (관리자 전용)
// ============================================================
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../common/dto/error-response.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@pg-system/shared';
import { ApiKeyService } from '../services/api-key.service';
import { CreateApiKeyDto } from '../dto/create-api-key.dto';

/**
 * @description PG 게이트웨이 API 키 관리 컨트롤러 (관리자 전용). 가맹점용 API 키 발급·조회·폐기 엔드포인트 제공.
 * JWT 인증 + PG_API_MANAGE 권한 필요. secretKey는 발급 시 1회만 반환되며, 이후 조회 불가.
 * 폐기는 소프트 삭제 방식 적용 (revoked_at 타임스탬프).
 * @security PCI DSS 8.6 - API 키/시크릿 안전 관리 및 수명주기 통제
 */
@ApiTags('PG-APIKey')
@ApiBearerAuth('JWT')
@Controller('pg/v1/api-keys')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.PG_API_MANAGE)
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * POST /pg/v1/api-keys
   * 가맹점용 API 키 발급. secretKey는 응답에 1회만 포함.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '가맹점 API 키 발급 (관리자)' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'API 키 발급 성공. secretKey는 응답에 1회만 포함',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '인증 실패 (JWT 토큰)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: '권한 부족 (PG_API_MANAGE 필요)',
    type: ErrorResponseDto,
  })
  async create(@Body() dto: CreateApiKeyDto) {
    const result = await this.apiKeyService.createApiKey(dto);
    return { data: result };
  }

  /**
   * GET /pg/v1/api-keys?merchantId=xxx
   * 가맹점의 API 키 목록 조회 (secretKey 미포함).
   */
  @Get()
  @ApiOperation({ summary: '가맹점 API 키 목록 조회 (관리자)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'API 키 목록 조회 성공',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '인증 실패 (JWT 토큰)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: '권한 부족 (PG_API_MANAGE 필요)',
    type: ErrorResponseDto,
  })
  async list(@Query('merchantId', ParseUUIDPipe) merchantId: string) {
    const result = await this.apiKeyService.listApiKeys(merchantId);
    return { data: result };
  }

  /**
   * DELETE /pg/v1/api-keys/:id?merchantId=xxx
   * API 키 폐기 (소프트 삭제).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'API 키 폐기 (관리자)' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'API 키 폐기 성공',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '인증 실패 (JWT 토큰)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: '권한 부족 (PG_API_MANAGE 필요)',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'API 키 미존재',
    type: ErrorResponseDto,
  })
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('merchantId', ParseUUIDPipe) merchantId: string,
  ) {
    await this.apiKeyService.revokeApiKey(id, merchantId);
  }
}
