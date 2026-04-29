import { registerAs } from "@nestjs/config";
import { CACHE_TTL } from "@pg-system/shared";

export const appConfig = registerAs("app", () => ({
  nodeEnv: process.env["NODE_ENV"] ?? "development",
  port: parseInt(process.env["API_PORT"] ?? "4000", 10),
  allowedOrigins: (
    process.env["ALLOWED_ORIGINS"] ?? "http://localhost:3500"
  ).split(","),
}));

export const databaseConfig = registerAs("database", () => ({
  url: process.env["DATABASE_URL"],
}));

export const jwtConfig = registerAs("jwt", () => ({
  accessSecret: process.env["JWT_ACCESS_SECRET"],
  refreshSecret: process.env["JWT_REFRESH_SECRET"],
  mfaSecret: process.env["JWT_MFA_SECRET"],
  accessExpiresIn: process.env["JWT_ACCESS_EXPIRES_IN"] ?? "15m",
  refreshExpiresIn: process.env["JWT_REFRESH_EXPIRES_IN"] ?? "7d",
}));

export const encryptionConfig = registerAs("encryption", () => ({
  key: process.env["ENCRYPTION_KEY"],
  ivLength: parseInt(process.env["ENCRYPTION_IV_LENGTH"] ?? "16", 10),
  mfaSecretKey: process.env["MFA_ENCRYPTION_KEY"],
}));

export const throttleConfig = registerAs("throttle", () => ({
  ttl: parseInt(process.env["THROTTLE_TTL"] ?? "60000", 10),
  limit: parseInt(process.env["THROTTLE_LIMIT"] ?? "100", 10),
  paymentLimit: parseInt(process.env["PAYMENT_THROTTLE_LIMIT"] ?? "10", 10),
  loginLimit: parseInt(process.env["LOGIN_THROTTLE_LIMIT"] ?? "5", 10),
}));

export const cacheConfig = registerAs("cache", () => ({
  defaultTtl: parseInt(
    process.env["CACHE_DEFAULT_TTL"] ?? String(CACHE_TTL.DEFAULT),
    10,
  ),
  maxItems: parseInt(process.env["CACHE_MAX_ITEMS"] ?? "1000", 10),
  redisUrl: process.env["REDIS_URL"] ?? undefined,
}));

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
