'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRoles } from '@/hooks/use-roles';
import { useAssignRoles } from '@/hooks/use-users';
import { useToast } from '@/hooks/use-toast';

interface UserRoleAssignProps {
  userId: string;
  currentRoleIds: string[];
  onSaved?: () => void;
}

export function UserRoleAssign({ userId, currentRoleIds, onSaved }: UserRoleAssignProps) {
  const { roles, isLoading: rolesLoading } = useRoles();
  const { assignRoles, isLoading } = useAssignRoles(userId);
  const { success, error } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(currentRoleIds));

  const toggle = (roleId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    try {
      await assignRoles(Array.from(selected));
      success('역할이 저장되었습니다.');
      onSaved?.();
    } catch {
      error('역할 저장에 실패했습니다.');
    }
  };

  if (rolesLoading) {
    return <p className="text-sm text-gray-400">역할 목록을 불러오는 중...</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">역할 할당</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {roles.map((role) => (
          <label
            key={role.id}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 px-3 py-2 hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selected.has(role.id)}
              onChange={() => toggle(role.id)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">{role.name}</p>
              {role.description !== null && (
                <p className="text-xs text-gray-500">{role.description}</p>
              )}
            </div>
          </label>
        ))}
      </div>
      <Button onClick={handleSave} disabled={isLoading} size="sm">
        {isLoading ? '저장 중...' : '역할 저장'}
      </Button>
    </div>
  );
}
