'use client';

import { useContext } from 'react';
import { ToastContext, type ToastVariant } from '@/components/ui/toast';

export function useToast() {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return {
    toast: ctx.toast,
    dismiss: ctx.dismiss,
    success: (message: string) => ctx.toast(message, 'success' satisfies ToastVariant),
    error: (message: string) => ctx.toast(message, 'error' satisfies ToastVariant),
    info: (message: string) => ctx.toast(message, 'info' satisfies ToastVariant),
  };
}
