export type UserType = "ADMIN" | "AGENT" | "MERCHANT";
export type UserStatus = "ACTIVE" | "LOCKED" | "DORMANT" | "WITHDRAWN";

export interface Permission {
  id: string;
  code: string;
  name: string;
  resource: string;
  action: string;
}

/** Backend returns role_permissions as nested join structure */
export interface RolePermissionJoin {
  permissions: Permission;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  user_type: UserType;
  created_at?: string;
  updated_at?: string;
  role_permissions?: RolePermissionJoin[];
}

/** Backend returns user_roles as nested join structure */
export interface UserRoleJoin {
  assigned_at: string;
  roles: {
    id: string;
    name: string;
    description?: string | null;
    user_type: UserType;
  };
}

export interface User {
  id: string;
  login_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  user_type: UserType;
  org_id?: string | null;
  status: UserStatus;
  mfa_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at?: string;
  user_roles?: UserRoleJoin[];
  permissions?: string[];
}

export interface LoginResponse {
  requiresMfa: boolean;
  accessToken?: string;
  user?: User;
}

export interface MfaResponse {
  accessToken: string;
  user: User;
}

export interface JwtPayload {
  sub: string;
  loginId: string;
  userType: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
}

// ============================================================
// Mutation payloads / responses
// ============================================================

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface MfaSetupResponse {
  secret: string;
  qrCodeUrl: string;
  backupCodes?: string[];
}

export interface MfaEnablePayload {
  code: string;
}

export interface UpdateProfilePayload {
  name: string;
  email?: string | undefined;
  phone?: string | undefined;
}

/** 유저 역할에서 권한 코드 배열 추출 */
export function extractPermissions(user: User): string[] {
  const codes = new Set<string>();
  const userRoles = user.user_roles ?? [];
  for (const ur of userRoles) {
    // Note: user_roles from /users/:id doesn't include permissions
    // Use JWT payload permissions instead for permission checks
    void ur;
  }
  return Array.from(codes);
}

/** Helper: get role IDs from user_roles */
export function getUserRoleIds(user: User): string[] {
  return (user.user_roles ?? []).map((ur) => ur.roles.id);
}

/** Helper: get role names from user_roles */
export function getUserRoleNames(user: User): string[] {
  return (user.user_roles ?? []).map((ur) => ur.roles.name);
}

/** Helper: flatten role_permissions to Permission[] */
export function flattenPermissions(role: Role): Permission[] {
  return (role.role_permissions ?? []).map((rp) => rp.permissions);
}
