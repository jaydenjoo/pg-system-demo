"use client";

import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import type { Notification } from "@/types/system";

interface NotificationListProps {
  notifications: Notification[];
  isLoading: boolean;
}

export function NotificationList({
  notifications,
  isLoading,
}: NotificationListProps) {
  if (isLoading) {
    return <p className="px-4 py-8 text-center text-sm text-gray-400">불러오는 중...</p>;
  }
  if (notifications.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-gray-400">
        알림이 없습니다.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-100">
      {notifications.map((n) => (
        <li
          key={n.id}
          className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Badge variant={n.is_read ? "secondary" : "default"}>
                {n.type}
              </Badge>
              {!n.is_read && (
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-gray-900">{n.title}</p>
            <p className="mt-0.5 text-xs text-gray-500">{n.content}</p>
          </div>
          <span className="whitespace-nowrap text-xs text-gray-400">
            {formatDate(n.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}
