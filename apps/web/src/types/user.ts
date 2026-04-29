export type {
  User,
  Role,
  Permission,
  UserType,
  UserStatus,
  UserRoleJoin,
  RolePermissionJoin,
} from '@/types/auth';

export interface CreateUserForm {
  loginId: string;
  password: string;
  name: string;
  email?: string;
  phone?: string;
  userType: 'ADMIN' | 'AGENT' | 'MERCHANT';
  roleIds?: string[];
}

export interface UpdateUserForm {
  name?: string;
  email?: string;
  phone?: string;
  status?: 'ACTIVE' | 'LOCKED' | 'DORMANT' | 'WITHDRAWN';
}

export interface UpdateMyProfileForm {
  newPassword?: string;
}

export interface UserListQuery {
  page?: number;
  limit?: number;
  search?: string;
  userType?: string;
  status?: string;
}

export interface CreateRoleForm {
  name: string;
  description?: string;
  userType: 'ADMIN' | 'AGENT' | 'MERCHANT';
  permissionIds?: string[];
}

export interface UpdateRoleForm {
  name?: string;
  description?: string;
}
