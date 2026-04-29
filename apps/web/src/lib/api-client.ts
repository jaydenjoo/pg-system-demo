import type { ApiResponse, ApiError } from '@/types/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    let err: ApiError;
    try {
      err = (await res.json()) as ApiError;
    } catch {
      err = { error: { code: 'UNKNOWN', message: '서버 오류가 발생했습니다.' } };
    }

    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login';
    }

    throw new ApiClientError(err.error.code, err.error.message, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  return apiFetch<ApiResponse<T>>(path);
}

export function apiPost<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  return apiFetch<ApiResponse<T>>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function apiPut<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  return apiFetch<ApiResponse<T>>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function apiDelete(path: string): Promise<void> {
  return apiFetch<void>(path, { method: 'DELETE' });
}
