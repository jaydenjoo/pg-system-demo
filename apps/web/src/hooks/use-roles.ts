'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api-client';
import type { Role } from '@/types/auth';
import type { ApiResponse } from '@/types/api';
import type { CreateRoleForm, UpdateRoleForm } from '@/types/user';

export function useRoles() {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<Role[]>>(
    '/roles',
    apiGet<Role[]>,
  );
  return {
    roles: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useRole(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<Role>>(
    id !== null ? `/roles/${id}` : null,
    apiGet<Role>,
  );
  return {
    role: data?.data ?? null,
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useCreateRole() {
  const [isLoading, setIsLoading] = useState(false);

  const createRole = async (form: CreateRoleForm): Promise<Role> => {
    setIsLoading(true);
    try {
      const res = await apiPost<Role>('/roles', form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { createRole, isLoading };
}

export function useUpdateRole(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const updateRole = async (form: UpdateRoleForm): Promise<Role> => {
    setIsLoading(true);
    try {
      const res = await apiPut<Role>(`/roles/${id}`, form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateRole, isLoading };
}

export function useDeleteRole() {
  const [isLoading, setIsLoading] = useState(false);

  const deleteRole = async (id: string): Promise<void> => {
    setIsLoading(true);
    try {
      await apiDelete(`/roles/${id}`);
    } finally {
      setIsLoading(false);
    }
  };

  return { deleteRole, isLoading };
}

export function useAssignPermissions(roleId: string) {
  const [isLoading, setIsLoading] = useState(false);

  const assignPermissions = async (permissionIds: string[]): Promise<void> => {
    setIsLoading(true);
    try {
      await apiPut(`/roles/${roleId}/permissions`, { permissionIds });
    } finally {
      setIsLoading(false);
    }
  };

  return { assignPermissions, isLoading };
}
