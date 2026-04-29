"use client";

import { useState } from "react";
import { apiPost, apiPut } from "@/lib/api-client";
import type {
  ChangePasswordPayload,
  MfaSetupResponse,
  MfaEnablePayload,
  UpdateProfilePayload,
  User,
} from "@/types/auth";

export function useChangePassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changePassword(
    payload: ChangePasswordPayload,
  ): Promise<boolean> {
    setIsLoading(true);
    setError(null);
    try {
      await apiPost<void>("/auth/password/change", payload);
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "비밀번호 변경에 실패했습니다.",
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  return { changePassword, isLoading, error };
}

export function useMfaSetup() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setupMfa(): Promise<MfaSetupResponse | null> {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiPost<MfaSetupResponse>("/auth/mfa/setup", {});
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "MFA 설정에 실패했습니다.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  return { setupMfa, isLoading, error };
}

export function useMfaEnable() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enableMfa(payload: MfaEnablePayload): Promise<boolean> {
    setIsLoading(true);
    setError(null);
    try {
      await apiPost<void>("/auth/mfa/enable", payload);
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "MFA 활성화에 실패했습니다.",
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  return { enableMfa, isLoading, error };
}

export function useUpdateProfile() {
  const [isLoading, setIsLoading] = useState(false);

  async function updateProfile(payload: UpdateProfilePayload): Promise<User> {
    setIsLoading(true);
    try {
      const res = await apiPut<User>("/users/me", payload);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }

  return { updateProfile, isLoading };
}

export function useLogout() {
  const [isLoading, setIsLoading] = useState(false);

  async function logout(): Promise<void> {
    setIsLoading(true);
    try {
      await apiPost<void>("/auth/logout", {});
    } finally {
      setIsLoading(false);
      window.location.href = "/login";
    }
  }

  return { logout, isLoading };
}
