import { Injectable, OnModuleInit } from "@nestjs/common";
import * as promClient from "prom-client";

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry: promClient.Registry;
  readonly httpRequestsTotal: promClient.Counter<string>;
  readonly httpRequestDurationSeconds: promClient.Histogram<string>;
  readonly activeUsersGauge: promClient.Gauge<string>;
  readonly dbQueryDurationSeconds: promClient.Histogram<string>;
  readonly riskAlertsTotal: promClient.Counter<string>;

  constructor() {
    this.registry = new promClient.Registry();

    this.httpRequestsTotal = new promClient.Counter({
      name: "http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "route", "status_code"],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new promClient.Histogram({
      name: "http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "route"],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.activeUsersGauge = new promClient.Gauge({
      name: "active_users_gauge",
      help: "Number of currently active users",
      registers: [this.registry],
    });

    this.dbQueryDurationSeconds = new promClient.Histogram({
      name: "db_query_duration_seconds",
      help: "Database query duration in seconds",
      labelNames: ["operation"],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.registry],
    });

    this.riskAlertsTotal = new promClient.Counter({
      name: "risk_alerts_total",
      help: "Total number of risk alerts created",
      labelNames: ["severity"],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    promClient.collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
