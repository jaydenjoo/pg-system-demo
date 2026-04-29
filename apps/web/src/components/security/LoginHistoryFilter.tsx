"use client";

import { Input } from "@/components/ui/input";
import type { LoginHistoryQuery } from "@/types/security";

interface LoginHistoryFilterProps {
  query: LoginHistoryQuery;
  onChange: (query: LoginHistoryQuery) => void;
}

const RESULT_OPTIONS = [
  { value: "", label: "결과 전체" },
  { value: "SUCCESS", label: "성공" },
  { value: "FAILED", label: "실패" },
  { value: "MFA_PENDING", label: "MFA 대기" },
];

export function LoginHistoryFilter({
  query,
  onChange,
}: LoginHistoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Input
        placeholder="사용자 ID"
        value={query.userId ?? ""}
        onChange={(e) =>
          onChange({ ...query, userId: e.target.value || undefined })
        }
        className="w-48"
      />
      <select
        value={query.result ?? ""}
        onChange={(e) =>
          onChange({
            ...query,
            result: e.target.value || undefined,
            page: 1,
          })
        }
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
      >
        {RESULT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
