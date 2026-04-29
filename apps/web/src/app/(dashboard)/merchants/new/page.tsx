"use client";

import { useRouter } from "next/navigation";
import { MerchantForm } from "@/components/merchants/MerchantForm";
import { useCreateMerchant } from "@/hooks/use-merchants";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { CreateMerchantForm, UpdateMerchantForm } from "@/types/merchant";

export default function NewMerchantPage() {
  const router = useRouter();
  const { createMerchant, isLoading } = useCreateMerchant();
  const { success, error } = useToast();

  const handleSubmit = async (data: CreateMerchantForm | UpdateMerchantForm) => {
    try {
      await createMerchant(data as CreateMerchantForm);
      success("가맹점이 등록되었습니다.");
      router.push("/merchants");
    } catch (err) {
      error(err instanceof Error ? err.message : "가맹점 등록에 실패했습니다.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          ← 뒤로
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">가맹점 추가</h1>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <MerchantForm
          mode="create"
          onSubmit={handleSubmit}
          isLoading={isLoading}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}
