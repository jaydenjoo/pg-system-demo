import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { USER_STATUS, type UserStatus } from "@pg-system/shared";

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: "사용자명",
    example: "홍길동",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: "사용자 상태",
    enum: USER_STATUS,
    example: "active",
  })
  @IsOptional()
  @IsEnum(USER_STATUS)
  status?: UserStatus;

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
}
