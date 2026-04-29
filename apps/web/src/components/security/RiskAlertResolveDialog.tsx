"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RiskAlert } from "@/types/security";

interface RiskAlertResolveDialogProps {
  alert: RiskAlert | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function RiskAlertResolveDialog({
  alert,
  open,
  onClose,
  onConfirm,
  isLoading,
}: RiskAlertResolveDialogProps) {
  if (alert === null) return null;

  return (
    <Dialog open={open} onClose={onClose} title="위험 알림 해결 처리">
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-4 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-medium text-gray-700">알림 유형:</span>
            <span>{alert.alert_type}</span>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="font-medium text-gray-700">심각도:</span>
            <Badge
              variant={
                alert.severity === "CRITICAL" || alert.severity === "HIGH"
                  ? "danger"
                  : alert.severity === "MEDIUM"
                    ? "warning"
                    : "secondary"
              }
            >
              {alert.severity}
            </Badge>
          </div>
          <div>
            <span className="font-medium text-gray-700">설명:</span>
            <p className="mt-1 text-gray-600">{alert.description}</p>
          </div>
        </div>

        <p className="text-sm text-gray-600">
          이 위험 알림을 해결 처리하시겠습니까?
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            취소
          </Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading ? "처리 중..." : "해결 처리"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
