import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DatabaseHealth {
  @ApiProperty({
    enum: ['connected', 'disconnected'],
    description: '데이터베이스 연결 상태',
    example: 'connected',
  })
  status!: 'connected' | 'disconnected';

  @ApiPropertyOptional({
    type: 'number',
    description: '데이터베이스 응답 시간 (ms)',
    example: 12,
  })
  latency?: number;
}

export class HealthResponse {
  @ApiProperty({
    enum: ['healthy', 'unhealthy'],
    description: '시스템 상태',
    example: 'healthy',
  })
  status!: 'healthy' | 'unhealthy';

  @ApiProperty({
    description: '상태 확인 시간 (ISO 8601 형식)',
    example: '2026-03-02T10:30:00Z',
  })
  timestamp!: string;

  @ApiProperty({
    type: 'number',
    description: '서버 가동 시간 (초)',
    example: 3600,
  })
  uptime!: number;

  @ApiProperty({
    description: 'API 버전',
    example: '1.0.0',
  })
  version!: string;

  @ApiProperty({
    type: DatabaseHealth,
    description: '데이터베이스 상태',
  })
  database!: DatabaseHealth;
}
