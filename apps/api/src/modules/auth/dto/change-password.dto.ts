import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class ChangePasswordDto {
  @ApiProperty({
    description: "현재 비밀번호",
    example: "OldPassword123!",
  })
  @IsString()
  @MaxLength(256, { message: "비밀번호가 너무 깁니다" })
  currentPassword!: string;

  @ApiProperty({
    description: "새 비밀번호 (12자 이상)",
    example: "NewSecurePass123!",
  })
  @IsString()
  @MinLength(12, {
    message: "비밀번호는 12자 이상이어야 합니다",
  })
  @MaxLength(256, { message: "비밀번호가 너무 깁니다" })
  @Matches(
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]).{12,}$/,
    {
      message:
        "비밀번호는 최소 12자이며 영문, 숫자, 특수문자를 포함해야 합니다",
    },
  )
  newPassword!: string;
}
