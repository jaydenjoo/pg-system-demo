export type NotificationSeverity =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INFO";

export interface NotificationPayload {
  title: string;
  message: string;
  severity: NotificationSeverity;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface NotificationChannel {
  send(payload: NotificationPayload): Promise<void>;
}
