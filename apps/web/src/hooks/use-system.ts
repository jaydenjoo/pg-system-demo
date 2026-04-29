"use client";

import useSWR from "swr";
import { useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  SystemCode,
  Holiday,
  MenuItem,
  Notification,
  CreateSystemCodeForm,
  UpdateSystemCodeForm,
} from "@/types/system";

/** 시스템 코드 전체 조회 */
export function useSystemCodes() {
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<SystemCode[]>
  >("/system/codes", apiGet<SystemCode[]>);
  return {
    codes: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

/** 특정 그룹의 시스템 코드 조회 */
export function useSystemCodesByGroup(groupCode: string | null) {
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<SystemCode[]>
  >(
    groupCode !== null ? `/system/codes/group/${groupCode}` : null,
    apiGet<SystemCode[]>,
  );
  return {
    codes: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

/** 시스템 코드 생성 */
export function useCreateSystemCode() {
  const [isLoading, setIsLoading] = useState(false);

  const createCode = async (
    form: CreateSystemCodeForm,
  ): Promise<SystemCode> => {
    setIsLoading(true);
    try {
      const res = await apiPost<SystemCode>("/system/codes", form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { createCode, isLoading };
}

/** 시스템 코드 수정 */
export function useUpdateSystemCode() {
  const [isLoading, setIsLoading] = useState(false);

  const updateCode = async (
    id: string,
    form: UpdateSystemCodeForm,
  ): Promise<SystemCode> => {
    setIsLoading(true);
    try {
      const res = await apiPut<SystemCode>(`/system/codes/${id}`, form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateCode, isLoading };
}

/** 시스템 코드 삭제 (soft delete) */
export function useDeleteSystemCode() {
  const [isLoading, setIsLoading] = useState(false);

  const deleteCode = async (id: string): Promise<void> => {
    setIsLoading(true);
    try {
      await apiDelete(`/system/codes/${id}`);
    } finally {
      setIsLoading(false);
    }
  };

  return { deleteCode, isLoading };
}

/** 공휴일 목록 조회 */
export function useHolidays() {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<Holiday[]>>(
    "/system/holidays",
    apiGet<Holiday[]>,
  );
  return {
    holidays: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

/** 메뉴 트리 조회 */
export function useMenus() {
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<MenuItem[]>
  >("/system/menus", apiGet<MenuItem[]>);
  return {
    menus: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

/** 알림 목록 조회 (최신 20개) */
export function useNotifications() {
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<Notification[]>
  >("/system/notifications", apiGet<Notification[]>);
  return {
    notifications: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}
