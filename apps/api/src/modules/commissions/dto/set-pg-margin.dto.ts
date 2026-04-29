import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SetPgMarginDto {
  @ApiProperty({ description: "결제 수단명", example: "credit_card" })
  @IsString()
  @MaxLength(20)
  paymentMethod!: string;

  @ApiPropertyOptional({ description: "카드사명", example: "신한카드" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cardCompany?: string;

  @ApiProperty({
    description: "마진율 (소수점 4자리 이하)",
    example: "2.5",
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: "마진율은 숫자(소수점 4자리 이하)만 허용됩니다",
  })
  @MaxLength(10)
  marginRate!: string;

  @ApiPropertyOptional({
    type: "number",
    description: "최소 수수료 (원)",
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minFee?: number;
}
