import { Injectable, Logger } from "@nestjs/common";
import { NotificationPayload } from "./channels/notification-channel.interface";
import { SlackChannel } from "./channels/slack.channel";
import { EmailChannel } from "./channels/email.channel";

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5분

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly recentEvents = new Map<string, number>();

  constructor(
    private readonly slack: SlackChannel,
    private readonly email: EmailChannel,
  ) {}

  async send(payload: NotificationPayload): Promise<void> {
    const key = `${payload.title}:${payload.severity}`;
    const lastSent = this.recentEvents.get(key) ?? 0;
    const now = Date.now();

    if (now - lastSent < DEDUP_WINDOW_MS) {
      this.logger.debug(`[Notifications] 중복 이벤트 차단: ${key}`);
      return;
    }

    this.recentEvents.set(key, now);
    this.cleanupExpiredEntries();

    await Promise.all(
      [this.slack, this.email].map((channel) =>
        channel.send(payload).catch((err: unknown) => {
          this.logger.error(`[Notifications] 채널 발송 실패: ${String(err)}`);
        }),
      ),
    );
  }

  private cleanupExpiredEntries(): void {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [key, timestamp] of this.recentEvents) {
      if (timestamp < cutoff) {
        this.recentEvents.delete(key);
      }
    }
  }
}
