import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRoleDto {
  @ApiPropertyOptional({
    description: '역할명',
    example: '관리자',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({
    description: '역할 설명',
    example: '전체 시스템 관리 권한',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
