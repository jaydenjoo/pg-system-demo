import { IsDateString, IsOptional, IsUUID } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class DashboardQueryDto {
  @ApiPropertyOptional({
    description: "시작 날짜 (ISO 8601 형식)",
    example: "2026-03-01",
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: "종료 날짜 (ISO 8601 형식)",
    example: "2026-03-31",
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: "가맹점 ID (UUID)",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @ApiPropertyOptional({
    description: "대리점 ID (UUID)",
    example: "550e8400-e29b-41d4-a716-446655440001",
  })
  @IsOptional()
  @IsUUID()
  agentId?: string;
}
