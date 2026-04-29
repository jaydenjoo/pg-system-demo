import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AGENT_STATUS } from '@pg-system/shared';

export class UpdateAgentDto {
  @ApiPropertyOptional({
    description: '대리점명',
    example: '서울 대리점',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  agentName?: string;

  @ApiPropertyOptional({
    description: '대리점 상태',
    example: 'ACTIVE',
    enum: Object.values(AGENT_STATUS),
  })
  @IsOptional()
  @IsEnum(AGENT_STATUS, { message: '유효하지 않은 대리점 상태입니다' })
  status?: string;
}
