"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AuditLogQuery } from "@/types/security";

interface AuditLogFilterProps {
  query: AuditLogQuery;
  onChange: (query: AuditLogQuery) => void;
  onSearch: () => void;
  onReset: () => void;
}

export function AuditLogFilter({
  query,
  onChange,
  onSearch,
  onReset,
}: AuditLogFilterProps) {
  const update = (patch: Partial<AuditLogQuery>): void => {
    onChange({ ...query, ...patch });
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">
          사용자 ID
        </label>
        <Input
          placeholder="UUID"
          value={query.userId ?? ""}
          onChange={(e) => update({ userId: e.target.value || undefined })}
          className="w-48"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">
          액션
        </label>
        <Input
          placeholder="예: CREATE, UPDATE"
          value={query.action ?? ""}
          onChange={(e) => update({ action: e.target.value || undefined })}
          className="w-40"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">
          리소스 타입
        </label>
        <Input
          placeholder="예: USER, MERCHANT"
          value={query.resourceType ?? ""}
          onChange={(e) =>
            update({ resourceType: e.target.value || undefined })
          }
          className="w-40"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">
          시작일
        </label>
        <Input
          type="date"
          value={query.startDate ?? ""}
          onChange={(e) => update({ startDate: e.target.value || undefined })}
          className="w-36"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">
          종료일
        </label>
        <Input
          type="date"
          value={query.endDate ?? ""}
          onChange={(e) => update({ endDate: e.target.value || undefined })}
          className="w-36"
        />
      </div>
      <Button onClick={onSearch}>조회</Button>
      <Button variant="ghost" onClick={onReset}>
        초기화
      </Button>
    </div>
  );
}
