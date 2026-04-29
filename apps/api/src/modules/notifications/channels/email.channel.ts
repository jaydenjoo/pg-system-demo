import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import {
  NotificationChannel,
  NotificationPayload,
} from "./notification-channel.interface";

@Injectable()
export class EmailChannel implements NotificationChannel {
  private readonly logger = new Logger(EmailChannel.name);
  private readonly transporter: nodemailer.Transporter | null = null;
  private readonly emailTo: string | undefined;
  private readonly emailFrom: string | undefined;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>("notification.smtp.host");
    const user = this.config.get<string>("notification.smtp.user");
    const pass = this.config.get<string>("notification.smtp.pass");
    this.emailTo = this.config.get<string>("notification.alertEmailTo");
    this.emailFrom = user;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>("notification.smtp.port", 587),
        secure: false,
        auth: { user, pass },
      });
    }
  }

  async send(payload: NotificationPayload): Promise<void> {
    if (!this.transporter || !this.emailTo) {
      this.logger.debug("[Email] SMTP 설정 미완료 — 알림 스킵");
      return;
    }

    const metaHtml = payload.metadata
      ? `<pre style="background:#f4f4f4;padding:12px">${JSON.stringify(payload.metadata, null, 2)}</pre>`
      : "";

    try {
      await this.transporter.sendMail({
        from: `"PG System Monitor" <${this.emailFrom ?? "noreply@pg-system.local"}>`,
        to: this.emailTo,
        subject: `[${payload.severity}] ${payload.title}`,
        html: `
          <h2 style="color:#d32f2f">[${payload.severity}] ${payload.title}</h2>
          <p>${payload.message}</p>
          <p style="color:#666">시각: ${payload.timestamp.toISOString()}</p>
          ${metaHtml}
        `,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Email] 전송 실패: ${message}`);
    }
  }
}
