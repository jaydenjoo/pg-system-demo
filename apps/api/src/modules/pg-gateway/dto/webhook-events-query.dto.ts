// ============================================================
// PG Gateway — 웹훅 이벤트 조회 쿼리 DTO
// ============================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { WEBHOOK_STATUS } from '@pg-system/shared';

const VALID_STATUSES = [
  WEBHOOK_STATUS.PENDING,
  WEBHOOK_STATUS.SENT,
  WEBHOOK_STATUS.FAILED,
] as const;

export class WebhookEventsQueryDto {
  @ApiPropertyOptional({
    description: '이벤트 상태 필터',
    enum: VALID_STATUSES,
  })
  @IsOptional()
  @IsString()
  @IsIn(VALID_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    description: '조회 시작일 (ISO 8601)',
    example: '2026-03-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: '조회 종료일 (ISO 8601)',
    example: '2026-03-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: '조회 건수 (1~50, 기본 20)',
    example: '20',
  })
  @IsOptional()
  @IsString()
  limit?: string;
}
