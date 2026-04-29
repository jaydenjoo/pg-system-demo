"use client";

import { Settings } from "lucide-react";
import { ProfileInfo } from "@/components/profile/ProfileInfo";
import { PasswordChangeForm } from "@/components/profile/PasswordChangeForm";
import { MfaSetup } from "@/components/profile/MfaSetup";

export default function AgentSettingsPage(): React.JSX.Element {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-gray-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">설정</h1>
          <p className="mt-0.5 text-sm text-gray-500">프로필 및 보안 설정</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileInfo />
        <PasswordChangeForm />
      </div>

      <MfaSetup />
    </div>
  );
}
