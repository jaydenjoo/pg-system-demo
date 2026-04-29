import { MiddlewareConsumer, Module, NestModule, Logger } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { CorrelationIdMiddleware } from "./common/middleware/correlation-id.middleware";
import { createLoggerConfig } from "./config/logging.config";
import { ConfigModule } from "@nestjs/config";
import { CacheModule } from "@nestjs/cache-manager";
import { BullModule } from "@nestjs/bullmq";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule, ThrottlerModuleOptions } from "@nestjs/throttler";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import { CACHE_TTL } from "@pg-system/shared";
import Keyv from "keyv";
import KeyvRedis from "@keyv/redis";

import {
  appConfig,
  databaseConfig,
  jwtConfig,
  encryptionConfig,
  throttleConfig,
  cacheConfig,
  notificationConfig,
} from "./config/app.config";
import { GlobalExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor";
import { BigIntSerializationInterceptor } from "./common/interceptors/bigint-serialization.interceptor";
import { MetricsInterceptor } from "./common/interceptors/metrics.interceptor";
import { validateConfig } from "./config/config.validation";

import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { AgentsModule } from "./modules/agents/agents.module";
import { MerchantsModule } from "./modules/merchants/merchants.module";
import { TransactionsModule } from "./modules/transactions/transactions.module";
import { SettlementsModule } from "./modules/settlements/settlements.module";
import { CommissionsModule } from "./modules/commissions/commissions.module";
import { DepositsModule } from "./modules/deposits/deposits.module";
import { SecurityModule } from "./modules/security/security.module";
import { SystemModule } from "./modules/system/system.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { HealthModule } from "./modules/health/health.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { MetricsModule } from "./modules/metrics/metrics.module";
import { PgGatewayModule } from "./modules/pg-gateway/pg-gateway.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        encryptionConfig,
        throttleConfig,
        cacheConfig,
        notificationConfig,
      ],
      validate: validateConfig,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): ThrottlerModuleOptions => [
        {
          ttl: config.get<number>("throttle.ttl", 60000),
          limit: config.get<number>("throttle.limit", 100),
        },
      ],
    }),
    LoggerModule.forRoot(createLoggerConfig()),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>("cache.redisUrl");
        if (redisUrl) {
          const logger = new Logger("CacheModule");
          logger.log(`Redis 캐시 연결: ${redisUrl.replace(/\/\/.*@/, "//***@")}`);
          return {
            stores: [new Keyv({ store: new KeyvRedis(redisUrl), ttl: CACHE_TTL.DEFAULT })],
          };
        }
        // Redis 미설정 → Keyv 인메모리 캐시 (개발/테스트 환경)
        return {
          stores: [new Keyv({ ttl: CACHE_TTL.DEFAULT })],
        };
      },
    }),
    // BullMQ — Redis 설정 시 비동기 Job 큐 활성화, 미설정 시 모듈만 로드 (큐 사용 불가)
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>("cache.redisUrl");
        if (redisUrl) {
          const logger = new Logger("BullMQ");
          logger.log("BullMQ 큐 연결: Redis");
          const url = new URL(redisUrl);
          return {
            connection: {
              host: url.hostname,
              port: parseInt(url.port || "6379", 10),
              ...(url.password ? { password: url.password } : {}),
            },
          };
        }
        // Redis 미설정 → 연결 없이 모듈만 로드 (개발/테스트 환경)
        return { connection: { host: "localhost", port: 6379, lazyConnect: true } };
      },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    AgentsModule,
    MerchantsModule,
    TransactionsModule,
    SettlementsModule,
    CommissionsModule,
    DepositsModule,
    NotificationsModule,
    MetricsModule,
    SecurityModule,
    SystemModule,
    DashboardModule,
    HealthModule,
    PgGatewayModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: BigIntSerializationInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes("*");
  }
}
