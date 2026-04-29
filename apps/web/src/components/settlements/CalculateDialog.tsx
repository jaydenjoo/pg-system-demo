"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CalculateSettlementForm } from "@/types/settlement";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (form: CalculateSettlementForm) => Promise<void>;
  isLoading: boolean;
}

export function CalculateDialog({ isOpen, onClose, onConfirm, isLoading }: Props) {
  const [form, setForm] = useState<CalculateSettlementForm>({
    settlementDate: "",
    periodFrom: "",
    periodTo: "",
  });
  const [errors, setErrors] = useState<Partial<CalculateSettlementForm>>({});

  const validate = (): boolean => {
    const next: Partial<CalculateSettlementForm> = {};
    if (!form.settlementDate) next.settlementDate = "정산일을 선택해주세요.";
    if (!form.periodFrom) next.periodFrom = "시작일을 선택해주세요.";
    if (!form.periodTo) next.periodTo = "종료일을 선택해주세요.";
    if (form.periodFrom && form.periodTo && form.periodFrom > form.periodTo) {
      next.periodTo = "종료일은 시작일 이후여야 합니다.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onConfirm(form);
    setForm({ settlementDate: "", periodFrom: "", periodTo: "" });
  };

  const handleClose = () => {
    setForm({ settlementDate: "", periodFrom: "", periodTo: "" });
    setErrors({});
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} title="정산 계산">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            정산일 <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={form.settlementDate}
            onChange={(e) => setForm((prev) => ({ ...prev, settlementDate: e.target.value }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.settlementDate && (
            <p className="mt-1 text-xs text-red-500">{errors.settlementDate}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              기간 시작일 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.periodFrom}
              onChange={(e) => setForm((prev) => ({ ...prev, periodFrom: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.periodFrom && (
              <p className="mt-1 text-xs text-red-500">{errors.periodFrom}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              기간 종료일 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.periodTo}
              onChange={(e) => setForm((prev) => ({ ...prev, periodTo: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.periodTo && (
              <p className="mt-1 text-xs text-red-500">{errors.periodTo}</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
            닫기
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "계산중..." : "정산 계산"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
