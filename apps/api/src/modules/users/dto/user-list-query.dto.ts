import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { USER_TYPES, USER_STATUS, type UserType, type UserStatus } from '@pg-system/shared';

export class UserListQueryDto {
  @ApiPropertyOptional({
    description: '페이지 번호 (1부터 시작)',
    type: 'number',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: '페이지당 항목 수 (최대 100)',
    type: 'number',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: '사용자 유형',
    enum: USER_TYPES,
    example: 'admin',
  })
  @IsOptional()
  @IsEnum(USER_TYPES)
  userType?: UserType;

  @ApiPropertyOptional({
    description: '사용자 상태',
    enum: USER_STATUS,
    example: 'active',
  })
  @IsOptional()
  @IsEnum(USER_STATUS)
  status?: UserStatus;

  @ApiPropertyOptional({
    description: '검색 키워드 (이름, 이메일 등)',
    example: '홍길동',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
