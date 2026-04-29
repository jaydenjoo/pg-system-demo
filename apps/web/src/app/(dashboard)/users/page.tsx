"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUsers } from "@/hooks/use-users";
import { UserTable } from "@/components/users/UserTable";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import type { UserListQuery } from "@/types/user";

const USER_TYPE_OPTIONS = [
  { value: "ADMIN", label: "관리자" },
  { value: "AGENT", label: "대리점" },
  { value: "MERCHANT", label: "가맹점" },
];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "활성" },
  { value: "LOCKED", label: "잠금" },
  { value: "DORMANT", label: "휴면" },
  { value: "WITHDRAWN", label: "탈퇴" },
];

export default function UsersPage() {
  const router = useRouter();
  const [query, setQuery] = useState<UserListQuery>({
    page: 1,
    limit: 20,
    search: "",
    userType: "",
    status: "",
  });

  const { users, meta, isLoading, mutate } = useUsers(query);

  const updateQuery = (updates: Partial<UserListQuery>) => {
    setQuery((prev) => ({ ...prev, ...updates, page: 1 }));
  };

  const handleReset = () => {
    setQuery({ page: 1, limit: 20, search: "", userType: "", status: "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">사용자 관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            총 {meta.total.toLocaleString()}명
          </p>
        </div>
        <Button onClick={() => router.push("/users/new")}>+ 사용자 추가</Button>
      </div>

      <FilterBar
        searchValue={query.search ?? ""}
        onSearchChange={(v) => updateQuery({ search: v })}
        searchPlaceholder="아이디 또는 이름 검색..."
        filters={[
          {
            key: "userType",
            label: "유형",
            options: USER_TYPE_OPTIONS,
            value: query.userType ?? "",
            onChange: (v) => updateQuery({ userType: v }),
          },
          {
            key: "status",
            label: "상태",
            options: STATUS_OPTIONS,
            value: query.status ?? "",
            onChange: (v) => updateQuery({ status: v }),
          },
        ]}
        onReset={handleReset}
      />

      <UserTable
        users={users}
        isLoading={isLoading}
        onRefresh={() => void mutate()}
      />

      <Pagination
        page={query.page ?? 1}
        totalPages={meta.totalPages}
        onPageChange={(p) => setQuery((prev) => ({ ...prev, page: p }))}
      />
    </div>
  );
}
