import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  API_PORT: number = 4000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  ENCRYPTION_KEY!: string;

  // MFA 전용 시크릿 — PCI DSS 8.4.2 (모든 환경에서 필수)
  @IsString()
  JWT_MFA_SECRET!: string;

  @IsString()
  MFA_ENCRYPTION_KEY!: string;

  // Redis — 미설정 시 인메모리 캐시 사용
  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  // 선택적 서비스 — 미설정 시 해당 기능만 비활성화
  @IsString()
  @IsOptional()
  SLACK_WEBHOOK_URL?: string;

  @IsString()
  @IsOptional()
  SMTP_HOST?: string;
}

export function validateConfig(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`환경변수 검증 실패: ${errorMessages}`);
  }

  return validatedConfig;
}
