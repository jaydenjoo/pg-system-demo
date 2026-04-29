import { IsInt, IsUUID, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ManualMatchDto {
  @ApiProperty({
    description: "거래 ID (UUID)",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @IsUUID()
  transactionId!: string;

  @ApiProperty({
    type: "number",
    description: "매칭된 금액 (원)",
    example: 100000,
  })
  @IsInt()
  @Min(1)
  matchedAmount!: number;
}
