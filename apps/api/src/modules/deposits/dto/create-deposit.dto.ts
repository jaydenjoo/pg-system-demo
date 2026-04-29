import { IsDateString, IsInt, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDepositDto {
  @ApiProperty({
    description: "입금 날짜 (ISO 8601 형식)",
    example: "2026-03-01T10:30:00Z",
  })
  @IsDateString()
  depositDate!: string;

  @ApiProperty({
    description: "입금 출처",
    example: "bank_transfer",
  })
  @IsString()
  source!: string;

  @ApiProperty({
    type: "number",
    description: "입금액 (원)",
    example: 100000,
  })
  @IsInt()
  @Min(1)
  amount!: number;
}
