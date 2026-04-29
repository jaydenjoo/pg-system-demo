import { IsEnum } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { MERCHANT_STATUS, MerchantStatusCode } from "@pg-system/shared";

export class ChangeMerchantStatusDto {
  @ApiProperty({
    description: "변경할 가맹점 상태",
    example: "ACTIVE",
    enum: Object.values(MERCHANT_STATUS),
  })
  @IsEnum(MERCHANT_STATUS)
  status!: MerchantStatusCode;
}
