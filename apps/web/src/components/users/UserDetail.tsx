"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { User } from "@/types/auth";
import { getUserRoleNames } from "@/types/auth";

interface UserDetailProps {
  user: User;
}

const USER_TYPE_LABELS: Record<string, string> = {
  ADMIN: "관리자",
  AGENT: "대리점",
  MERCHANT: "가맹점",
};

export function UserDetail({ user }: UserDetailProps) {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">기본 정보</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">아이디</dt>
            <dd className="font-medium text-gray-900">{user.login_id}</dd>
          </div>
          <div>
            <dt className="text-gray-500">이름</dt>
            <dd className="font-medium text-gray-900">{user.name}</dd>
          </div>
          <div>
            <dt className="text-gray-500">이메일</dt>
            <dd className="font-medium text-gray-900">{user.email ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">전화번호</dt>
            <dd className="font-medium text-gray-900">{user.phone ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">유형</dt>
            <dd>
              <Badge variant="secondary">
                {USER_TYPE_LABELS[user.user_type] ?? user.user_type}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">상태</dt>
            <dd>
              <Badge variant={user.status === "ACTIVE" ? "success" : "default"}>
                {user.status}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">생성일</dt>
            <dd className="font-medium text-gray-900">
              {new Date(user.created_at).toLocaleString("ko-KR")}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">역할</h3>
        {(user.user_roles ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">할당된 역할이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {getUserRoleNames(user).map((roleName) => (
              <Badge key={roleName} variant="secondary">
                {roleName}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
