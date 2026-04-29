'use client';

import { useState } from 'react';
import { User, Lock, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfileInfo } from '@/components/profile/ProfileInfo';
import { PasswordChangeForm } from '@/components/profile/PasswordChangeForm';
import { MfaSetup } from '@/components/profile/MfaSetup';

type Tab = 'info' | 'password' | 'mfa';

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'info', label: '내 정보', icon: <User className="h-4 w-4" /> },
  { id: 'password', label: '비밀번호 변경', icon: <Lock className="h-4 w-4" /> },
  { id: 'mfa', label: 'MFA 설정', icon: <ShieldCheck className="h-4 w-4" /> },
];

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<Tab>('info');

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">프로필 설정</h1>
        <p className="mt-1 text-sm text-gray-500">계정 정보 및 보안 설정을 관리합니다.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'info' && <ProfileInfo />}
          {activeTab === 'password' && <PasswordChangeForm />}
          {activeTab === 'mfa' && <MfaSetup />}
        </div>
      </div>
    </div>
  );
}
