import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

export class RefreshTokenDto {
  @ApiProperty({
    description: "갱신 토큰 (JWT 형식)",
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  })
  @IsString()
  @MaxLength(512, { message: "토큰 형식이 올바르지 않습니다" })
  refreshToken!: string;
}
