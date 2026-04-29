/** 시스템 코드 (system_codes) */
export interface SystemCode {
  id: string;
  group_code: string;
  code: string;
  name: string;
  sort_order: number;
  extra_value1: string | null;
  extra_value2: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** 공휴일 (holidays) */
export interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  year: number;
  created_at: string;
}

/** 메뉴 항목 (menus) — 트리 구조 */
export interface MenuItem {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  path: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  required_permission: string | null;
  user_type: string;
  created_at: string;
  updated_at: string;
  children?: MenuItem[];
}

/** 알림 (notifications) */
export interface Notification {
  id: string;
  user_id: string | null;
  type: string;
  title: string;
  content: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

/** 시스템 코드 생성 폼 */
export interface CreateSystemCodeForm {
  groupCode: string;
  code: string;
  name: string;
  sortOrder?: number | undefined;
  extraValue1?: string | undefined;
  extraValue2?: string | undefined;
}

/** 시스템 코드 수정 폼 */
export interface UpdateSystemCodeForm {
  name?: string | undefined;
  sortOrder?: number | undefined;
  extraValue1?: string | undefined;
  extraValue2?: string | undefined;
  isActive?: boolean | undefined;
}
