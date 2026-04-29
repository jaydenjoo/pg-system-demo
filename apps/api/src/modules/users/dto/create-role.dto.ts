import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { USER_TYPES, type UserType } from '@pg-system/shared';

export class CreateRoleDto {
  @ApiProperty({
    description: '역할명',
    example: '관리자',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @ApiPropertyOptional({
    description: '역할 설명',
    example: '전체 시스템 관리 권한',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    description: '사용자 유형',
    enum: USER_TYPES,
    example: 'admin',
  })
  @IsEnum(USER_TYPES)
  userType!: UserType;

  @ApiPropertyOptional({
    description: '권한 ID 배열',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}
