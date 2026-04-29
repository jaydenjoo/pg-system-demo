"use client";

import { Button } from "@/components/ui/button";
import type { SystemCode } from "@/types/system";

interface SystemCodeGroupFilterProps {
  codes: SystemCode[];
  selectedGroup: string;
  onSelectGroup: (group: string) => void;
}

export function SystemCodeGroupFilter({
  codes,
  selectedGroup,
  onSelectGroup,
}: SystemCodeGroupFilterProps) {
  /** 고유 그룹코드 추출 (순서 유지) */
  const groups: string[] = [];
  for (const c of codes) {
    if (!groups.includes(c.group_code)) {
      groups.push(c.group_code);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant={selectedGroup === "" ? "default" : "outline"}
        onClick={() => onSelectGroup("")}
      >
        전체
      </Button>
      {groups.map((g) => (
        <Button
          key={g}
          size="sm"
          variant={selectedGroup === g ? "default" : "outline"}
          onClick={() => onSelectGroup(g)}
        >
          {g}
        </Button>
      ))}
    </div>
  );
}
