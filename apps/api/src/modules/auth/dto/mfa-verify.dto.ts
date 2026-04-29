import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length, Matches, MaxLength } from "class-validator";

export class MfaVerifyDto {
  @ApiProperty({
    description: "MFA 검증용 임시 토큰",
    example: "mfa_temp_xxxxxxxxxxxxxxxxxxxxxxxx",
  })
  @IsString()
  @MaxLength(2048, { message: "토큰 형식이 올바르지 않습니다" })
  mfaToken!: string;

  @ApiProperty({
    description: "TOTP 앱에서 생성된 6자리 코드",
    example: "123456",
  })
  @IsString()
  @Length(6, 6, { message: "MFA 코드는 6자리여야 합니다" })
  @Matches(/^\d{6}$/, { message: "MFA 코드는 숫자 6자리여야 합니다" })
  code!: string;
}
