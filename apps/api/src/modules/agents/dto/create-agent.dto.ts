import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateAgentDto {
  @ApiProperty({
    description: "대리점명",
    example: "서울 대리점",
  })
  @IsString()
  @IsNotEmpty({ message: "대리점명은 필수 입력입니다" })
  @MaxLength(100)
  agentName!: string;

  @ApiProperty({
    description: "사업자등록번호",
    example: "123-45-67890",
  })
  @IsString()
  @IsNotEmpty({ message: "사업자등록번호는 필수 입력입니다" })
  @MaxLength(20)
  businessNo!: string;

  @ApiPropertyOptional({
    description: "대표자명",
    example: "홍길동",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  representative?: string;

  @ApiPropertyOptional({
    description: "업태",
    example: "서비스업",
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  businessType?: string;

  @ApiPropertyOptional({
    description: "상위 대리점 ID (UUID)",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @IsOptional()
  @IsUUID()
  parentAgentId?: string;

  @ApiPropertyOptional({
    description: "계약 시작일",
    example: "2024-01-01",
  })
  @IsOptional()
  @IsDateString()
  contractStartDate?: Date;

  @ApiPropertyOptional({
    description: "계약 종료일",
    example: "2025-12-31",
  })
  @IsOptional()
  @IsDateString()
  contractEndDate?: Date;

  @ApiPropertyOptional({
    description: "은행명",
    example: "국민은행",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankName?: string;

  @ApiPropertyOptional({
    description: "계좌번호",
    example: "123-456-789012",
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  bankAccount?: string;

  @ApiPropertyOptional({
    description: "예금주명",
    example: "홍길동",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankHolder?: string;
}
