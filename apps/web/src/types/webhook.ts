// ============================================================
// Webhook 프론트엔드 타입 정의 (OST)
// ============================================================

export interface WebhookConfig {
  webhookUrl: string | null;
  hasWebhookSecret: boolean;
}

export interface WebhookEvent {
  id: string;
  event_type: string;
  status: string;
  retry_count: number;
  sent_at: string | null;
  response_status: number | null;
  created_at: string;
}

export interface WebhookEventsResponse {
  events: WebhookEvent[];
  count: number;
}

export interface WebhookEventsQuery {
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: string;
}

export interface WebhookTestResult {
  success: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  message: string | null;
}

export interface WebhookResendResult {
  success: boolean;
  message: string;
}

export interface UpdateWebhookConfigForm {
  webhookUrl: string;
  webhookSecret?: string;
}
