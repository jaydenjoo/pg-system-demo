'use client';

import { useState } from 'react';
import { useRoles, useCreateRole, useUpdateRole } from '@/hooks/use-roles';
import { RoleTable } from '@/components/roles/RoleTable';
import { RoleForm } from '@/components/roles/RoleForm';
import { PermissionMatrix } from '@/components/roles/PermissionMatrix';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { flattenPermissions } from '@/types/auth';
import type { Role } from '@/types/auth';
import type { CreateRoleForm, UpdateRoleForm } from '@/types/user';

type PanelMode = 'create' | 'edit' | 'permissions' | null;

export default function RolesPage() {
  const { roles, isLoading, mutate } = useRoles();
  const { createRole, isLoading: isCreating } = useCreateRole();
  const [editTarget, setEditTarget] = useState<Role | null>(null);
  const [permTarget, setPermTarget] = useState<Role | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const { success, error } = useToast();

  const { updateRole, isLoading: isUpdating } = useUpdateRole(editTarget?.id ?? '');

  const handleCreate = async (data: CreateRoleForm | UpdateRoleForm) => {
    try {
      await createRole(data as CreateRoleForm);
      success('역할이 생성되었습니다.');
      void mutate();
      setPanelMode(null);
    } catch (err) {
      error(err instanceof Error ? err.message : '역할 생성에 실패했습니다.');
    }
  };

  const handleUpdate = async (data: CreateRoleForm | UpdateRoleForm) => {
    try {
      await updateRole(data as UpdateRoleForm);
      success('역할이 수정되었습니다.');
      void mutate();
      setPanelMode(null);
      setEditTarget(null);
    } catch (err) {
      error(err instanceof Error ? err.message : '역할 수정에 실패했습니다.');
    }
  };

  const openEdit = (role: Role) => {
    setEditTarget(role);
    setPanelMode('edit');
  };

  const openPermissions = (role: Role) => {
    setPermTarget(role);
    setPanelMode('permissions');
  };

  const closePanel = () => {
    setPanelMode(null);
    setEditTarget(null);
    setPermTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">역할 & 권한 관리</h1>
          <p className="mt-1 text-sm text-gray-500">총 {roles.length}개 역할</p>
        </div>
        <Button onClick={() => setPanelMode('create')}>+ 역할 추가</Button>
      </div>

      <RoleTable
        roles={roles}
        isLoading={isLoading}
        onRefresh={() => void mutate()}
        onEdit={openEdit}
      />

      {/* 각 역할 카드에서 권한 관리 버튼 */}
      {roles.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-800">권한 매트릭스 관리</h2>
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => (
              <Button
                key={role.id}
                variant="outline"
                size="sm"
                onClick={() => openPermissions(role)}
              >
                {role.name} 권한 설정
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* 역할 생성 다이얼로그 */}
      <Dialog
        open={panelMode === 'create'}
        onClose={closePanel}
        title="역할 추가"
      >
        <RoleForm
          mode="create"
          onSubmit={handleCreate}
          isLoading={isCreating}
        />
      </Dialog>

      {/* 역할 수정 다이얼로그 */}
      <Dialog
        open={panelMode === 'edit'}
        onClose={closePanel}
        title="역할 수정"
      >
        <RoleForm
          mode="update"
          defaultValues={{
            name: editTarget?.name ?? '',
            description: editTarget?.description ?? '',
          }}
          onSubmit={handleUpdate}
          isLoading={isUpdating}
        />
      </Dialog>

      {/* 권한 매트릭스 다이얼로그 */}
      <Dialog
        open={panelMode === 'permissions'}
        onClose={closePanel}
        title={`${permTarget?.name ?? ''} 권한 설정`}
        className="max-w-3xl"
      >
        {permTarget !== null && (
          <PermissionMatrix
            roleId={permTarget.id}
            currentPermissions={flattenPermissions(permTarget)}
            onSaved={() => {
              void mutate();
              closePanel();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
