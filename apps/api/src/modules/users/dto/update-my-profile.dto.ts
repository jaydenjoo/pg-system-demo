import { IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMyProfileDto {
  @ApiPropertyOptional({
    description: '새 비밀번호 (영문, 숫자, 특수문자 포함, 최소 12자)',
    example: 'NewSecurePass123!',
  })
  @IsOptional()
  @IsString()
  @MinLength(12)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]).{12,}$/, {
    message: '비밀번호는 최소 12자이며 영문, 숫자, 특수문자를 포함해야 합니다',
  })
  newPassword?: string;
}
