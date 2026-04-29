import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({
    description: "가맹점/관리자 로그인 아이디",
    example: "admin@payment",
  })
  @IsString()
  @MinLength(3, { message: "아이디는 3자 이상이어야 합니다" })
  @MaxLength(50, { message: "아이디는 50자 이하여야 합니다" })
  @Matches(/^[a-zA-Z0-9._@-]+$/, {
    message: "아이디는 영문, 숫자, 특수문자(._@-)만 사용 가능합니다",
  })
  loginId!: string;

  @ApiProperty({
    description: "로그인 비밀번호 (8자 이상)",
    example: "SecurePass123!",
  })
  @IsString()
  @MinLength(8, { message: "비밀번호는 8자 이상이어야 합니다" })
  @MaxLength(256, { message: "비밀번호가 너무 깁니다" })
  password!: string;
}
