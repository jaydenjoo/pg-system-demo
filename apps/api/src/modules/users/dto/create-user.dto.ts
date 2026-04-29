import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { USER_TYPES, type UserType } from "@pg-system/shared";

export class CreateUserDto {
  @ApiProperty({
    description: "로그인 아이디",
    example: "user123",
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._@-]+$/, {
    message: "로그인 아이디는 영문, 숫자, ._@- 만 허용됩니다",
  })
  loginId!: string;

  @ApiProperty({
    description: "사용자명",
    example: "홍길동",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: "비밀번호 (영문, 숫자, 특수문자 포함, 최소 12자)",
    example: "SecurePass123!",
  })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  @Matches(
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]).{12,}$/,
    {
      message:
        "비밀번호는 최소 12자이며 영문, 숫자, 특수문자를 포함해야 합니다",
    },
  )
  password!: string;

  @ApiProperty({
    description: "사용자 유형",
    enum: USER_TYPES,
    example: "admin",
  })
  @IsEnum(USER_TYPES)
  userType!: UserType;

  @ApiPropertyOptional({
    description: "이메일 주소",
    example: "user@example.com",
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: "전화번호",
    example: "010-1234-5678",
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9-]+$/, { message: "전화번호는 숫자와 하이픈만 허용됩니다" })
  phone?: string;

  @ApiPropertyOptional({
    description: "역할 ID 배열",
    example: ["550e8400-e29b-41d4-a716-446655440000"],
  })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  roleIds?: string[];
}
