import { IsDateString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CalculateSettlementDto {
  @ApiProperty({ type: "string", description: "정산 처리일 (ISO 8601)", example: "2024-01-31" })
  @IsDateString()
  settlementDate!: string;

  @ApiProperty({ type: "string", description: "정산 기간 시작일 (ISO 8601)", example: "2024-01-01" })
  @IsDateString()
  periodFrom!: string;

  @ApiProperty({ type: "string", description: "정산 기간 종료일 (ISO 8601)", example: "2024-01-31" })
  @IsDateString()
  periodTo!: string;
}
