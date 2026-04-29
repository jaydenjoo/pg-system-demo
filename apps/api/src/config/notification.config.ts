import { registerAs } from "@nestjs/config";

export const notificationConfig = registerAs("notification", () => ({
  slackWebhookUrl: process.env["SLACK_WEBHOOK_URL"],
  smtp: {
    host: process.env["SMTP_HOST"],
    port: parseInt(process.env["SMTP_PORT"] ?? "587", 10),
    user: process.env["SMTP_USER"],
    pass: process.env["SMTP_PASS"],
  },
  alertEmailTo: process.env["ALERT_EMAIL_TO"],
}));
