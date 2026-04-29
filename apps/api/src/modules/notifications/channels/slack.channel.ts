import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  NotificationChannel,
  NotificationPayload,
  NotificationSeverity,
} from "./notification-channel.interface";

const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  CRITICAL: "#FF0000",
  HIGH: "#FF8C00",
  MEDIUM: "#FFD700",
  LOW: "#1E90FF",
  INFO: "#808080",
};

const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 1000;

@Injectable()
export class SlackChannel implements NotificationChannel {
  private readonly logger = new Logger(SlackChannel.name);
  private readonly webhookUrl: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.webhookUrl = this.config.get<string>("notification.slackWebhookUrl");
  }

  async send(payload: NotificationPayload): Promise<void> {
    if (!this.webhookUrl) {
      this.logger.debug("[Slack] SLACK_WEBHOOK_URL 미설정 — 알림 스킵");
      return;
    }

    const body = JSON.stringify({
      attachments: [
        {
          color: SEVERITY_COLORS[payload.severity],
          title: `[${payload.severity}] ${payload.title}`,
          text: payload.message,
          footer: "PG System Monitor",
          ts: Math.floor(payload.timestamp.getTime() / 1000),
          fields: payload.metadata
            ? Object.entries(payload.metadata).map(([k, v]) => ({
                title: k,
                value: String(v),
                short: true,
              }))
            : [],
        },
      ],
    });

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(this.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });

        if (res.ok) return;
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[Slack] 전송 시도 ${attempt}/${MAX_RETRIES} 실패: ${message}`,
        );
        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_INTERVAL_MS),
          );
        }
      }
    }

    this.logger.error(`[Slack] ${MAX_RETRIES}회 재시도 후 전송 실패`);
  }
}
