import { IsBoolean, IsOptional, IsString } from "class-validator";
import { Transform } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class CommissionQueryDto {
  @ApiPropertyOptional({
    description: "결제 수단으로 필터링",
    example: "credit_card",
  })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({
    description: "카드사명으로 필터링",
    example: "신한카드",
  })
  @IsOptional()
  @IsString()
  cardCompany?: string;

  @ApiPropertyOptional({
    type: "boolean",
    description: "현재 수수료만 조회 여부",
    example: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === "true" || value === true)
  @IsBoolean()
  currentOnly?: boolean;
}
