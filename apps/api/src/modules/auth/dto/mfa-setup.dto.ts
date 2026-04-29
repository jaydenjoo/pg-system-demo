import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length, Matches } from "class-validator";

export class MfaEnableDto {
  @ApiProperty({
    description: "MFA 활성화를 위한 TOTP 코드 (6자리 숫자)",
    example: "123456",
  })
  @IsString()
  @Length(6, 6, { message: "MFA 코드는 6자리여야 합니다" })
  @Matches(/^\d{6}$/, { message: "MFA 코드는 숫자 6자리여야 합니다" })
  code!: string;
}
