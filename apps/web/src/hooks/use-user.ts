'use client';

import useSWR from 'swr';
import { apiGet } from '@/lib/api-client';
import type { User } from '@/types/auth';

export function useUser() {
  const { data, error, isLoading, mutate } = useSWR('/users/me', apiGet<User>);

  return {
    user: data?.data ?? null,
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}
