"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useMerchant, useUpdateMerchant } from "@/hooks/use-merchants";
import { MerchantDetail } from "@/components/merchants/MerchantDetail";
import { MerchantForm } from "@/components/merchants/MerchantForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { CreateMerchantForm, UpdateMerchantForm } from "@/types/merchant";

type Tab = "detail" | "edit";

export default function MerchantDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const merchantId = params.id;

  const { merchant, isLoading, mutate } = useMerchant(merchantId);
  const { updateMerchant, isLoading: isUpdating } = useUpdateMerchant(merchantId);
  const { success, error } = useToast();
  const [tab, setTab] = useState<Tab>("detail");

  const handleUpdate = async (data: CreateMerchantForm | UpdateMerchantForm) => {
    try {
      await updateMerchant(data as UpdateMerchantForm);
      success("가맹점 정보가 수정되었습니다.");
      await mutate();
      setTab("detail");
    } catch (err) {
      error(err instanceof Error ? err.message : "수정에 실패했습니다.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (merchant === null) {
    return (
      <div className="py-12 text-center text-gray-400">
        가맹점을 찾을 수 없습니다.
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "detail", label: "상세 정보" },
    { key: "edit", label: "정보 수정" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          ← 뒤로
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {merchant.merchant_name}
          </h1>
          <p className="font-mono text-sm text-gray-500">
            {merchant.merchant_code}
          </p>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {tab === "detail" && <MerchantDetail merchant={merchant} />}
        {tab === "edit" && (
          <div className="max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <MerchantForm
              mode="edit"
              merchant={merchant}
              onSubmit={handleUpdate}
              isLoading={isUpdating}
              onCancel={() => setTab("detail")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
