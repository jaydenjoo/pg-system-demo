"use client";

import { useState, useEffect } from "react";
import { Shield, Send, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWebhookConfig, useUpdateWebhookConfig, useTestWebhook } from "@/hooks/use-webhooks";
import { useToast } from "@/hooks/use-toast";
import type { WebhookTestResult } from "@/types/webhook";

export function WebhookConfigForm() {
  const { config, isLoading, mutate } = useWebhookConfig();
  const { updateConfig, isLoading: saving } = useUpdateWebhookConfig();
  const { testWebhook, isLoading: testing } = useTestWebhook();
  const { toast } = useToast();

  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);

  useEffect(() => {
    if (config?.webhookUrl) {
      setWebhookUrl(config.webhookUrl);
    }
  }, [config?.webhookUrl]);

  const handleSave = async (): Promise<void> => {
    if (!webhookUrl.startsWith("https://")) {
      toast("HTTPS URL만 허용됩니다.", "error");
      return;
    }
    if (webhookUrl.length > 512) {
      toast("URL은 512자 이내여야 합니다.", "error");
      return;
    }
    if (webhookSecret && webhookSecret.length < 32) {
      toast("Secret은 최소 32자 이상이어야 합니다.", "error");
      return;
    }

    try {
      const body: { webhookUrl: string; webhookSecret?: string } = { webhookUrl };
      if (webhookSecret) {
        body.webhookSecret = webhookSecret;
      }
      await updateConfig(body);
      setWebhookSecret("");
      await mutate();
      toast("웹훅 설정이 저장되었습니다.", "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "저장 실패";
      toast(msg, "error");
    }
  };

  const handleTest = async (): Promise<void> => {
    setTestResult(null);
    try {
      const result = await testWebhook();
      setTestResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "테스트 실패";
      toast(msg, "error");
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-200 rounded-md animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 설정 폼 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">웹훅 설정</h2>

        {/* URL 입력 */}
        <div className="space-y-1.5">
          <label htmlFor="webhook-url" className="block text-sm font-medium text-gray-700">
            웹훅 URL
          </label>
          <input
            id="webhook-url"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://example.com/webhook"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-500">HTTPS 프로토콜만 지원합니다. (최대 512자)</p>
        </div>

        {/* Secret 입력 */}
        <div className="space-y-1.5">
          <label htmlFor="webhook-secret" className="block text-sm font-medium text-gray-700">
            웹훅 Secret
          </label>
          <div className="relative">
            <input
              id="webhook-secret"
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={config?.hasWebhookSecret ? "••••••••••••••••" : "whsec_로 시작하는 32자 이상 문자열"}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {config?.hasWebhookSecret && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Shield className="h-4 w-4 text-green-500" />
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {config?.hasWebhookSecret
              ? "Secret이 설정되어 있습니다. 변경하려면 새 값을 입력하세요."
              : "HMAC-SHA256 서명 검증에 사용됩니다. 최소 32자."}
          </p>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || !webhookUrl}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "저장 중..." : "설정 저장"}
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !config?.webhookUrl}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
            {testing ? "발송 중..." : "테스트 발송"}
          </button>
        </div>
      </div>

      {/* 테스트 결과 */}
      {testResult !== null && (
        <div
          className={cn(
            "rounded-lg border p-4 flex items-start gap-3",
            testResult.success
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50",
          )}
        >
          {testResult.success ? (
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          )}
          <div className="space-y-1 text-sm">
            <p className={testResult.success ? "text-green-800 font-medium" : "text-red-800 font-medium"}>
              {testResult.success ? "테스트 성공" : "테스트 실패"}
            </p>
            {testResult.statusCode !== null && (
              <p className="text-gray-600">HTTP 상태 코드: {testResult.statusCode}</p>
            )}
            {testResult.responseTimeMs !== null && (
              <p className="text-gray-600">응답 시간: {testResult.responseTimeMs}ms</p>
            )}
            {testResult.message !== null && (
              <p className="text-gray-600">{testResult.message}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
