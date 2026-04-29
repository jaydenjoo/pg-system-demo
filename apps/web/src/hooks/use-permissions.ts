'use client';

import useSWR from 'swr';
import { apiGet } from '@/lib/api-client';
import type { Permission } from '@/types/auth';
import type { ApiResponse } from '@/types/api';

export function usePermissions() {
  const { data, error, isLoading } = useSWR<ApiResponse<Permission[]>>(
    '/permissions',
    apiGet<Permission[]>,
  );
  return {
    permissions: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
  };
}
