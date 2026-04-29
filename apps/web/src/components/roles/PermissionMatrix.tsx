"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { useAssignPermissions } from "@/hooks/use-roles";
import { useToast } from "@/hooks/use-toast";
import type { Permission } from "@/types/auth";

interface PermissionMatrixProps {
  roleId: string;
  currentPermissions: Permission[];
  onSaved?: () => void;
}

export function PermissionMatrix({
  roleId,
  currentPermissions,
  onSaved,
}: PermissionMatrixProps) {
  const { permissions, isLoading: permsLoading } = usePermissions();
  const { assignPermissions, isLoading } = useAssignPermissions(roleId);
  const { success, error } = useToast();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(currentPermissions.map((p) => p.id)),
  );

  const toggle = (permId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) {
        next.delete(permId);
      } else {
        next.add(permId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    try {
      await assignPermissions(Array.from(selected));
      success("권한이 저장되었습니다.");
      onSaved?.();
    } catch {
      error("권한 저장에 실패했습니다.");
    }
  };

  if (permsLoading) {
    return <p className="text-sm text-gray-400">권한 목록을 불러오는 중...</p>;
  }

  // resource 기준으로 묶기
  const groups = permissions.reduce<Record<string, Permission[]>>(
    (acc, perm) => {
      const key = perm.resource;
      if (acc[key] === undefined) {
        acc[key] = [];
      }
      acc[key].push(perm);
      return acc;
    },
    {},
  );

  const toggleGroup = (groupPerms: Permission[]) => {
    const allSelected = groupPerms.every((p) => selected.has(p.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of groupPerms) {
        if (allSelected) {
          next.delete(p.id);
        } else {
          next.add(p.id);
        }
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-gray-700">
        권한 매트릭스{" "}
        <span className="text-gray-400">({selected.size}개 선택됨)</span>
      </p>

      <div className="space-y-4">
        {Object.entries(groups).map(([groupName, perms]) => {
          const allSelected = perms.every((p) => selected.has(p.id));
          const someSelected = perms.some((p) => selected.has(p.id));

          return (
            <div
              key={groupName}
              className="rounded-lg border border-gray-200 p-4"
            >
              <label className="mb-3 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el !== null)
                      el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={() => toggleGroup(perms)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-semibold text-gray-800">
                  {groupName}
                </span>
              </label>

              <div className="grid gap-2 pl-6 sm:grid-cols-2 lg:grid-cols-3">
                {perms.map((perm) => (
                  <label
                    key={perm.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(perm.id)}
                      onChange={() => toggle(perm.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="text-sm text-gray-900">{perm.name}</p>
                      <p className="text-xs text-gray-400">{perm.code}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Button onClick={handleSave} disabled={isLoading} size="sm">
        {isLoading ? "저장 중..." : "권한 저장"}
      </Button>
    </div>
  );
}
