import { Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { HealthResponse, DatabaseHealth } from "./dto/health-response.dto";
import { NotificationsService } from "../notifications/notifications.service";

const APP_VERSION = "1.0.0";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async checkDatabase(): Promise<DatabaseHealth> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
      return {
        status: "connected",
        latency: Date.now() - start,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Database health check failed: ${message}`);
      return { status: "disconnected" };
    }
  }

  async getHealthStatus(): Promise<HealthResponse> {
    const database = await this.checkDatabase();
    const isHealthy = database.status === "connected";

    if (!isHealthy) {
      // 5분 dedup은 NotificationsService에서 처리 — fire-and-forget
      void this.notifications
        ?.send({
          title: "헬스체크 실패 — DB 연결 불가",
          message: `데이터베이스 상태: ${database.status}`,
          severity: "HIGH",
          timestamp: new Date(),
          metadata: { database: database.status },
        })
        .catch((err: unknown) => {
          this.logger.error(`헬스체크 알림 발송 실패: ${String(err)}`);
        });
    }

    return {
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: APP_VERSION,
      database,
    };
  }
}
