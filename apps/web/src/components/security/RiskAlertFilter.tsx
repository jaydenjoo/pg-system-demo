"use client";

import type { RiskAlertQuery } from "@/types/security";

interface RiskAlertFilterProps {
  query: RiskAlertQuery;
  onChange: (query: RiskAlertQuery) => void;
}

const SEVERITY_OPTIONS = [
  { value: "", label: "심각도 전체" },
  { value: "LOW", label: "LOW" },
  { value: "MEDIUM", label: "MEDIUM" },
  { value: "HIGH", label: "HIGH" },
  { value: "CRITICAL", label: "CRITICAL" },
];

const STATUS_OPTIONS = [
  { value: "", label: "상태 전체" },
  { value: "false", label: "미해결" },
  { value: "true", label: "해결" },
];

export function RiskAlertFilter({ query, onChange }: RiskAlertFilterProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={query.severity ?? ""}
        onChange={(e) =>
          onChange({
            ...query,
            severity: e.target.value || undefined,
            page: 1,
          })
        }
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
      >
        {SEVERITY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <select
        value={
          query.resolved === undefined
            ? ""
            : String(query.resolved)
        }
        onChange={(e) =>
          onChange({
            ...query,
            resolved:
              e.target.value === "" ? undefined : e.target.value === "true",
            page: 1,
          })
        }
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
