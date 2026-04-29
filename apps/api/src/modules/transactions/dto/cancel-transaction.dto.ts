import { IsString, MaxLength, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CancelTransactionDto {
  @ApiProperty({ type: "string", description: "취소 사유", example: "고객 요청에 따른 취소" })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
