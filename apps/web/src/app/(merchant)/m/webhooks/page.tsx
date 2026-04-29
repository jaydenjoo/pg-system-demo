"use client";

import { useState } from "react";
import { Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import { WebhookConfigForm } from "./components/WebhookConfigForm";
import { WebhookEventsTable } from "./components/WebhookEventsTable";

type Tab = "config" | "events";

const TABS: { key: Tab; label: string }[] = [
  { key: "config", label: "설정" },
  { key: "events", label: "이벤트 이력" },
];

export default function WebhooksPage() {
  const [activeTab, setActiveTab] = useState<Tab>("config");

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Webhook className="h-6 w-6 text-gray-500" />
        <h1 className="text-2xl font-bold text-gray-900">웹훅 관리</h1>
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "pb-3 text-sm font-medium transition-colors border-b-2",
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === "config" && <WebhookConfigForm />}
      {activeTab === "events" && <WebhookEventsTable />}
    </div>
  );
}
