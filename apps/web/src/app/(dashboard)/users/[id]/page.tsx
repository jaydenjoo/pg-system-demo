"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useUserById, useUpdateUser } from "@/hooks/use-users";
import { UserDetail } from "@/components/users/UserDetail";
import { UserForm } from "@/components/users/UserForm";
import { UserRoleAssign } from "@/components/users/UserRoleAssign";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getUserRoleIds } from "@/types/auth";
import type { CreateUserForm, UpdateUserForm } from "@/types/user";

type Tab = "detail" | "edit" | "roles";

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;

  const { user, isLoading, mutate } = useUserById(userId);
  const { updateUser, isLoading: isUpdating } = useUpdateUser(userId);
  const { success, error } = useToast();
  const [tab, setTab] = useState<Tab>("detail");

  const handleUpdate = async (data: CreateUserForm | UpdateUserForm) => {
    try {
      await updateUser(data as UpdateUserForm);
      success("사용자 정보가 수정되었습니다.");
      await mutate();
      setTab("detail");
    } catch (err) {
      error(err instanceof Error ? err.message : "수정에 실패했습니다.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="py-12 text-center text-gray-400">
        사용자를 찾을 수 없습니다.
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "detail", label: "상세 정보" },
    { key: "edit", label: "정보 수정" },
    { key: "roles", label: "역할 관리" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          ← 뒤로
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
          <p className="text-sm text-gray-500">{user.login_id}</p>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {tab === "detail" && <UserDetail user={user} />}
        {tab === "edit" && (
          <div className="max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <UserForm
              mode="update"
              defaultValues={{
                name: user.name,
                email: user.email ?? "",
                phone: user.phone ?? "",
                status: user.status,
              }}
              onSubmit={handleUpdate}
              isLoading={isUpdating}
            />
          </div>
        )}
        {tab === "roles" && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <UserRoleAssign
              userId={userId}
              currentRoleIds={getUserRoleIds(user)}
              onSaved={() => void mutate()}
            />
          </div>
        )}
      </div>
    </div>
  );
}
