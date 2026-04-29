"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ShieldCheck, ShieldOff, QrCode } from "lucide-react";
import { useMfaSetup, useMfaEnable } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const codeSchema = z.object({
  code: z
    .string()
    .length(6, "6자리 숫자를 입력해주세요.")
    .regex(/^\d+$/, "숫자만 입력 가능합니다."),
});

type CodeFormValues = z.infer<typeof codeSchema>;

type MfaFlowStep = "idle" | "qr" | "done";

interface MfaSetupData {
  secret: string;
  qrCodeUrl: string;
  backupCodes?: string[];
}

export function MfaSetup() {
  const { user, mutate } = useUser();
  const { setupMfa, isLoading: setupLoading } = useMfaSetup();
  const { enableMfa, isLoading: enableLoading } = useMfaEnable();
  const { success, error: toastError } = useToast();

  const [step, setStep] = useState<MfaFlowStep>("idle");
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CodeFormValues>({
    resolver: zodResolver(codeSchema),
  });

  const mfaEnabled = user?.mfa_enabled ?? false;

  async function handleStartSetup() {
    const data = await setupMfa();
    if (data) {
      setSetupData(data);
      setStep("qr");
    } else {
      toastError("MFA 설정을 시작할 수 없습니다.");
    }
  }

  async function onSubmitCode(values: CodeFormValues) {
    const ok = await enableMfa({ code: values.code });
    if (ok) {
      success("MFA가 활성화되었습니다.");
      await mutate();
      reset();
      setSetupData(null);
      setStep("done");
    } else {
      toastError("인증 코드가 올바르지 않습니다. 다시 시도해주세요.");
    }
  }

  if (step === "done") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <ShieldCheck className="h-16 w-16 text-green-500" />
        <p className="text-lg font-semibold text-gray-800">MFA 활성화 완료</p>
        <p className="text-sm text-gray-500">
          이제 로그인 시 인증 앱의 6자리 코드가 필요합니다.
        </p>
      </div>
    );
  }

  if (step === "qr" && setupData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <QrCode className="h-5 w-5" />
          <span>
            Google Authenticator 또는 호환 앱으로 QR 코드를 스캔하세요.
          </span>
        </div>

        <div className="flex justify-center">
          <img
            src={setupData.qrCodeUrl}
            alt="MFA QR Code"
            className="h-48 w-48 rounded-lg border border-gray-200"
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
          <p className="text-xs text-gray-500">직접 입력 시 시크릿 키</p>
          <p className="mt-1 font-mono text-sm font-medium tracking-widest text-gray-800">
            {setupData.secret}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmitCode)} className="space-y-4">
          <Input
            label="인증 앱의 6자리 코드 *"
            {...register("code")}
            error={errors.code?.message}
            placeholder="000000"
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
          />

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStep("idle");
                setSetupData(null);
                reset();
              }}
            >
              취소
            </Button>
            <Button type="submit" disabled={enableLoading} className="flex-1">
              {enableLoading ? "확인 중..." : "MFA 활성화"}
            </Button>
          </div>
        </form>

        {setupData.backupCodes && setupData.backupCodes.length > 0 && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm font-medium text-yellow-800">
              백업 코드 (안전한 곳에 보관하세요)
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1">
              {setupData.backupCodes.map((code, i) => (
                <span key={i} className="font-mono text-xs text-yellow-700">
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-lg border border-gray-200 p-4">
        {mfaEnabled ? (
          <ShieldCheck className="h-10 w-10 text-green-500" />
        ) : (
          <ShieldOff className="h-10 w-10 text-gray-400" />
        )}
        <div>
          <p className="font-semibold text-gray-800">
            MFA 상태: {mfaEnabled ? "활성화됨" : "비활성화"}
          </p>
          <p className="text-sm text-gray-500">
            {mfaEnabled
              ? "다중 인증이 활성화되어 있습니다."
              : "다중 인증을 설정하면 계정 보안이 강화됩니다."}
          </p>
        </div>
      </div>

      {!mfaEnabled && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
          <p className="font-medium">MFA 설정 안내</p>
          <ol className="mt-1 list-inside list-decimal space-y-0.5 text-blue-600">
            <li>Google Authenticator 앱을 스마트폰에 설치합니다.</li>
            <li>&quot;MFA 설정 시작&quot; 버튼을 클릭합니다.</li>
            <li>표시된 QR 코드를 앱으로 스캔합니다.</li>
            <li>앱에 표시된 6자리 코드를 입력하여 완료합니다.</li>
          </ol>
        </div>
      )}

      {!mfaEnabled && (
        <Button onClick={handleStartSetup} disabled={setupLoading}>
          {setupLoading ? "준비 중..." : "MFA 설정 시작"}
        </Button>
      )}
    </div>
  );
}
