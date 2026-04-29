import type { SWRConfiguration } from 'swr';
import { apiFetch } from './api-client';

export const swrConfig: SWRConfiguration = {
  fetcher: (url: string) => apiFetch(url),
  revalidateOnFocus: false,
  shouldRetryOnError: false,
};
