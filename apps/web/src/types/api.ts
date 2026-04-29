export interface ApiResponse<T> {
  data: T;
  meta?: PaginatedMeta;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}
