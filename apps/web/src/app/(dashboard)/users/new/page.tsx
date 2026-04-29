"use client";

import { useRouter } from "next/navigation";
import { UserForm } from "@/components/users/UserForm";
import { useCreateUser } from "@/hooks/use-users";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { CreateUserForm, UpdateUserForm } from "@/types/user";

export default function NewUserPage() {
  const router = useRouter();
  const { createUser, isLoading } = useCreateUser();
  const { success, error } = useToast();

  const handleSubmit = async (data: CreateUserForm | UpdateUserForm) => {
    try {
      await createUser(data as CreateUserForm);
      success("사용자가 생성되었습니다.");
      router.push("/users");
    } catch (err) {
      error(err instanceof Error ? err.message : "사용자 생성에 실패했습니다.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          ← 뒤로
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">사용자 추가</h1>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <UserForm
          mode="create"
          defaultValues={{ userType: "ADMIN", roleIds: [] }}
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
