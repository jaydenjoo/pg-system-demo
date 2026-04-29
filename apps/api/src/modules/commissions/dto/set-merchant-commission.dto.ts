import { IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SetMerchantCommissionDto {
  @ApiProperty({
    description: "결제 수단명",
    example: "credit_card",
  })
  @IsString()
  @MaxLength(30, { message: "결제 수단은 30자 이하여야 합니다" })
  paymentMethod!: string;

  @ApiPropertyOptional({
    description: "카드사명",
    example: "신한카드",
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cardCompany?: string;

  @ApiProperty({
    description: "가맹점 수수료율 (소수점 4자리 이하)",
    example: "2.5",
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: "수수료율은 숫자(소수점 4자리 이하)만 허용됩니다",
  })
  @MaxLength(10, { message: "수수료율은 10자 이하여야 합니다" })
  commissionRate!: string;
}
