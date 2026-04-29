"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SWRConfig } from "swr";
import {
  LayoutDashboard,
  Store,
  Building,
  ArrowLeftRight,
  Calculator,
  Percent,
  Landmark,
  Shield,
  Settings,
  Users,
  KeyRound,
  CreditCard,
  LogOut,
  User,
} from "lucide-react";
import { PERMISSIONS, type PermissionCode } from "@pg-system/shared";
import { cn } from "@/lib/utils";
import { swrConfig } from "@/lib/swr-config";
import { ToastProvider } from "@/components/ui/toast";
import { useUser } from "@/hooks/use-user";
import { useLogout } from "@/hooks/use-auth";

interface MenuItem {
  label: string;
  href: string;
  permission: PermissionCode;
  icon: React.ComponentType<{ className?: string }>;
}

const menuItems: MenuItem[] = [
  {
    label: "대시보드",
    href: "/dashboard",
    permission: PERMISSIONS.DASHBOARD_READ,
    icon: LayoutDashboard,
  },
  {
    label: "가맹점 관리",
    href: "/merchants",
    permission: PERMISSIONS.MERCHANT_READ,
    icon: Store,
  },
  {
    label: "대리점 관리",
    href: "/agents",
    permission: PERMISSIONS.AGENT_READ,
    icon: Building,
  },
  {
    label: "거래 내역",
    href: "/transactions",
    permission: PERMISSIONS.TRANSACTION_READ,
    icon: ArrowLeftRight,
  },
  {
    label: "정산 관리",
    href: "/settlements",
    permission: PERMISSIONS.SETTLEMENT_READ,
    icon: Calculator,
  },
  {
    label: "수수료 설정",
    href: "/commissions",
    permission: PERMISSIONS.COMMISSION_READ,
    icon: Percent,
  },
  {
    label: "입금 관리",
    href: "/deposits",
    permission: PERMISSIONS.DEPOSIT_READ,
    icon: Landmark,
  },
  {
    label: "보안 감사",
    href: "/security",
    permission: PERMISSIONS.AUDIT_READ,
    icon: Shield,
  },
  {
    label: "시스템 설정",
    href: "/system",
    permission: PERMISSIONS.SYSTEM_MANAGE,
    icon: Settings,
  },
  {
    label: "사용자 관리",
    href: "/users",
    permission: PERMISSIONS.USER_READ,
    icon: Users,
  },
  {
    label: "역할 관리",
    href: "/roles",
    permission: PERMISSIONS.USER_READ,
    icon: KeyRound,
  },
  {
    label: "결제 테스트",
    href: "/payment-test",
    permission: PERMISSIONS.SYSTEM_MANAGE,
    icon: CreditCard,
  },
];

function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const userPermissions = user?.permissions ?? [];

  const visibleMenuItems = menuItems.filter((item) =>
    userPermissions.includes(item.permission),
  );

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-white shadow-sm">
      <div className="flex h-16 items-center px-6 border-b">
        <span className="text-lg font-bold text-gray-900">PG System</span>
      </div>
      <nav className="mt-4 px-3 overflow-y-auto h-[calc(100vh-4rem)]">
        <ul className="space-y-1 pb-4">
          {visibleMenuItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

function Header() {
  const { user } = useUser();
  const { logout, isLoading: logoutLoading } = useLogout();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-end border-b bg-white px-6 shadow-sm gap-4">
      {user !== null && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <User className="h-4 w-4" />
          <span>{user.name}</span>
          {(user.user_roles ?? []).length > 0 && (
            <span className="text-gray-400">
              ({user.user_roles?.[0]?.roles.name})
            </span>
          )}
        </div>
      )}
      <button
        onClick={logout}
        disabled={logoutLoading}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" />
        로그아웃
      </button>
    </header>
  );
}

function DashboardLayoutInner({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar />
      <div className="pl-64">
        <Header />
        <main>{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={swrConfig}>
      <ToastProvider>
        <DashboardLayoutInner>{children}</DashboardLayoutInner>
      </ToastProvider>
    </SWRConfig>
  );
}
