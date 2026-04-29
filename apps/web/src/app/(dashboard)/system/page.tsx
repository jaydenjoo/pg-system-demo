"use client";

import { useState } from "react";
import {
  useSystemCodes,
  useCreateSystemCode,
  useUpdateSystemCode,
  useDeleteSystemCode,
  useHolidays,
  useMenus,
  useNotifications,
} from "@/hooks/use-system";
import { SystemCodeTable } from "@/components/system/SystemCodeTable";
import { SystemCodeForm } from "@/components/system/SystemCodeForm";
import { SystemCodeGroupFilter } from "@/components/system/SystemCodeGroupFilter";
import { HolidayList } from "@/components/system/HolidayList";
import { NotificationList } from "@/components/system/NotificationList";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type {
  SystemCode,
  CreateSystemCodeForm,
  UpdateSystemCodeForm,
  MenuItem,
} from "@/types/system";

type Tab = "codes" | "holidays" | "menus" | "notifications";

export default function SystemPage() {
  const [activeTab, setActiveTab] = useState<Tab>("codes");

  /* 코드 관리 상태 */
  const [selectedGroup, setSelectedGroup] = useState("");
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [editTarget, setEditTarget] = useState<SystemCode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SystemCode | null>(null);

  /* hooks */
  const {
    codes,
    isLoading: codesLoading,
    mutate: mutateCodes,
  } = useSystemCodes();
  const { createCode, isLoading: creating } = useCreateSystemCode();
  const { updateCode, isLoading: updating } = useUpdateSystemCode();
  const { deleteCode } = useDeleteSystemCode();
  const { holidays, isLoading: holidaysLoading } = useHolidays();
  const { menus, isLoading: menusLoading } = useMenus();
  const { notifications, isLoading: notificationsLoading } = useNotifications();

  const { success, error: toastError } = useToast();

  const tabs: { key: Tab; label: string }[] = [
    { key: "codes", label: "코드 관리" },
    { key: "holidays", label: "공휴일" },
    { key: "menus", label: "메뉴 구조" },
    { key: "notifications", label: "알림" },
  ];

  /* 그룹 필터 적용 */
  const filteredCodes = selectedGroup
    ? codes.filter((c) => c.group_code === selectedGroup)
    : codes;

  /* 코드 추가 */
  const handleCreate = async (form: CreateSystemCodeForm) => {
    try {
      await createCode(form);
      success("시스템 코드가 추가되었습니다.");
      setShowCodeForm(false);
      await mutateCodes();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "추가에 실패했습니다.");
    }
  };

  /* 코드 수정 */
  const handleUpdate = async (id: string, form: UpdateSystemCodeForm) => {
    try {
      await updateCode(id, form);
      success("시스템 코드가 수정되었습니다.");
      setShowCodeForm(false);
      setEditTarget(null);
      await mutateCodes();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "수정에 실패했습니다.");
    }
  };

  /* 코드 삭제 */
  const handleDeleteConfirm = async (): Promise<void> => {
    if (deleteTarget === null) return;
    try {
      await deleteCode(deleteTarget.id);
      success("시스템 코드가 삭제되었습니다.");
      setDeleteTarget(null);
      await mutateCodes();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    }
  };

  const openEditForm = (code: SystemCode) => {
    setEditTarget(code);
    setShowCodeForm(true);
  };

  const isSaving = creating || updating;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">시스템 관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            시스템 코드, 공휴일, 메뉴, 알림 관리
          </p>
        </div>
        {activeTab === "codes" && (
          <Button
            onClick={() => {
              setEditTarget(null);
              setShowCodeForm(true);
            }}
          >
            + 코드 추가
          </Button>
        )}
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 코드 관리 */}
      {activeTab === "codes" && (
        <div className="space-y-4">
          <SystemCodeGroupFilter
            codes={codes}
            selectedGroup={selectedGroup}
            onSelectGroup={setSelectedGroup}
          />
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <SystemCodeTable
              codes={filteredCodes}
              isLoading={codesLoading}
              onEdit={openEditForm}
              onDelete={setDeleteTarget}
            />
          </div>
        </div>
      )}

      {/* 공휴일 */}
      {activeTab === "holidays" && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <HolidayList holidays={holidays} isLoading={holidaysLoading} />
        </div>
      )}

      {/* 메뉴 트리 */}
      {activeTab === "menus" && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
          {menusLoading ? (
            <p className="text-sm text-gray-400">불러오는 중...</p>
          ) : menus.length === 0 ? (
            <p className="text-sm text-gray-400">등록된 메뉴가 없습니다.</p>
          ) : (
            <MenuTree items={menus} depth={0} />
          )}
        </div>
      )}

      {/* 알림 */}
      {activeTab === "notifications" && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <NotificationList
            notifications={notifications}
            isLoading={notificationsLoading}
          />
        </div>
      )}

      {/* 코드 추가/수정 다이얼로그 */}
      <Dialog
        open={showCodeForm}
        onClose={() => {
          setShowCodeForm(false);
          setEditTarget(null);
        }}
        title={editTarget !== null ? "시스템 코드 수정" : "시스템 코드 추가"}
      >
        <SystemCodeForm
          editTarget={editTarget}
          onSubmitCreate={handleCreate}
          onSubmitUpdate={handleUpdate}
          onCancel={() => {
            setShowCodeForm(false);
            setEditTarget(null);
          }}
          isLoading={isSaving}
        />
      </Dialog>

      {/* 코드 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="시스템 코드 삭제"
        description={`"${deleteTarget?.name ?? ""}" 코드를 삭제하시겠습니까?`}
        confirmLabel="삭제"
      />
    </div>
  );
}

/** 재귀 메뉴 트리 */
function MenuTree({ items, depth }: { items: MenuItem[]; depth: number }) {
  return (
    <ul className={depth > 0 ? "ml-6 border-l border-gray-200 pl-3" : ""}>
      {items.map((item) => (
        <li key={item.id} className="py-1.5">
          <div className="flex items-center gap-2 text-sm">
            {item.icon && <span className="text-gray-400">{item.icon}</span>}
            <span className="font-medium text-gray-900">{item.name}</span>
            <span className="font-mono text-xs text-gray-400">{item.code}</span>
            {item.path && (
              <span className="text-xs text-gray-400">{item.path}</span>
            )}
            <Badge variant={item.is_active ? "success" : "secondary"}>
              {item.is_active ? "활성" : "비활성"}
            </Badge>
            {item.required_permission && (
              <span className="text-xs text-gray-400">
                [{item.required_permission}]
              </span>
            )}
          </div>
          {item.children && item.children.length > 0 && (
            <MenuTree items={item.children} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}
