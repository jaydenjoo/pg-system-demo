"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CancelTransactionForm } from "@/types/transaction";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (form: CancelTransactionForm) => Promise<void>;
  isLoading: boolean;
}

export function CancelTransactionDialog({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("취소 사유를 입력해주세요.");
      return;
    }
    setError("");
    await onConfirm({ reason: reason.trim() });
    setReason("");
  };

  const handleClose = () => {
    setReason("");
    setError("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} title="거래 취소">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <p className="text-sm text-gray-600">
          이 거래를 취소하시겠습니까? 취소 사유를 입력해주세요.
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            취소 사유 <span className="text-red-500">*</span>
          </label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="취소 사유를 입력하세요"
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            닫기
          </Button>
          <Button type="submit" variant="destructive" disabled={isLoading}>
            {isLoading ? "처리중..." : "거래 취소"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
