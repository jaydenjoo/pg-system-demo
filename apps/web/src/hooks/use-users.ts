"use client";

import useSWR from "swr";
import { useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";
import type { User, UserRoleJoin } from "@/types/auth";
import type { ApiResponse } from "@/types/api";
import type {
  CreateUserForm,
  UpdateUserForm,
  UserListQuery,
} from "@/types/user";

function buildQueryString(query?: UserListQuery): string {
  if (query === undefined) return "";
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.search) params.set("search", query.search);
  if (query.userType) params.set("userType", query.userType);
  if (query.status) params.set("status", query.status);
  const str = params.toString();
  return str ? `?${str}` : "";
}

export function useUsers(query?: UserListQuery) {
  const qs = buildQueryString(query);
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<User[]>
  >(`/users${qs}`, apiGet<User[]>);
  return {
    users: data?.data ?? [],
    meta: data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 },
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useUserById(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<User>>(
    id !== null ? `/users/${id}` : null,
    apiGet<User>,
  );
  return {
    user: data?.data ?? null,
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useCreateUser() {
  const [isLoading, setIsLoading] = useState(false);

  const createUser = async (form: CreateUserForm): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await apiPost<User>("/users", form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { createUser, isLoading };
}

export function useUpdateUser(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const updateUser = async (form: UpdateUserForm): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await apiPut<User>(`/users/${id}`, form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateUser, isLoading };
}

export function useDeleteUser() {
  const [isLoading, setIsLoading] = useState(false);

  const deleteUser = async (id: string): Promise<void> => {
    setIsLoading(true);
    try {
      await apiDelete(`/users/${id}`);
    } finally {
      setIsLoading(false);
    }
  };

  return { deleteUser, isLoading };
}

export function useAssignRoles(userId: string) {
  const [isLoading, setIsLoading] = useState(false);

  const { data, error, mutate } = useSWR<ApiResponse<UserRoleJoin[]>>(
    `/users/${userId}/roles`,
    apiGet<UserRoleJoin[]>,
  );

  const assignRoles = async (roleIds: string[]): Promise<void> => {
    setIsLoading(true);
    try {
      await apiPut(`/users/${userId}/roles`, { roleIds });
      await mutate();
    } finally {
      setIsLoading(false);
    }
  };

  return {
    roleIds: (data?.data ?? []).map((ur) => ur.roles.id),
    isError: error !== undefined && error !== null,
    assignRoles,
    isLoading,
  };
}
