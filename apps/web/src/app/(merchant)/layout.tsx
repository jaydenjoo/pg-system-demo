"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SWRConfig } from "swr";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Calculator,
  Webhook,
  Settings,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { swrConfig } from "@/lib/swr-config";
import { ToastProvider } from "@/components/ui/toast";
import { useUser } from "@/hooks/use-user";
import { useLogout } from "@/hooks/use-auth";

interface MenuItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const menuItems: MenuItem[] = [
  { label: "대시보드", href: "/m/dashboard", icon: LayoutDashboard },
  { label: "거래 내역", href: "/m/transactions", icon: ArrowLeftRight },
  { label: "정산 내역", href: "/m/settlements", icon: Calculator },
  { label: "웹훅", href: "/m/webhooks", icon: Webhook },
  { label: "설정", href: "/m/settings", icon: Settings },
];

function MerchantSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-white shadow-sm">
      <div className="flex h-16 items-center px-6 border-b">
        <span className="text-lg font-bold text-gray-900">가맹점 포탈</span>
      </div>
      <nav className="mt-4 px-3 overflow-y-auto h-[calc(100vh-4rem)]">
        <ul className="space-y-1 pb-4">
          {menuItems.map((item) => {
            const isActive =
              item.href === "/m/dashboard"
                ? pathname === "/m/dashboard"
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

function MerchantHeader() {
  const { user } = useUser();
  const { logout, isLoading: logoutLoading } = useLogout();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-end border-b bg-white px-6 shadow-sm gap-4">
      {user !== null && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <User className="h-4 w-4" />
          <span>{user.name}</span>
          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            가맹점
          </span>
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

function MerchantLayoutInner({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <MerchantSidebar />
      <div className="pl-64">
        <MerchantHeader />
        <main>{children}</main>
      </div>
    </div>
  );
}

export default function MerchantLayout({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={swrConfig}>
      <ToastProvider>
        <MerchantLayoutInner>{children}</MerchantLayoutInner>
      </ToastProvider>
    </SWRConfig>
  );
}
