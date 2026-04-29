import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MetricsService } from "./metrics.service";
import { MetricsController } from "./metrics.controller";
import { MetricsIpGuard } from "./guards/metrics-ip.guard";

@Module({
  imports: [ConfigModule],
  providers: [MetricsService, MetricsIpGuard],
  controllers: [MetricsController],
  exports: [MetricsService],
})
export class MetricsModule {}
