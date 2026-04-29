'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const getPageNumbers = (): number[] => {
    const delta = 2;
    const start = Math.max(1, page - delta);
    const end = Math.min(totalPages, page + delta);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div className={cn('flex items-center justify-center gap-1', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="이전 페이지"
      >
        &lsaquo;
      </Button>

      {pages[0] !== undefined && pages[0] > 1 && (
        <>
          <PageButton page={1} current={page} onChange={onPageChange} />
          {pages[0] > 2 && <span className="px-1 text-gray-400">…</span>}
        </>
      )}

      {pages.map((p) => (
        <PageButton key={p} page={p} current={page} onChange={onPageChange} />
      ))}

      {pages[pages.length - 1] !== undefined && pages[pages.length - 1] < totalPages && (
        <>
          {pages[pages.length - 1] < totalPages - 1 && (
            <span className="px-1 text-gray-400">…</span>
          )}
          <PageButton page={totalPages} current={page} onChange={onPageChange} />
        </>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="다음 페이지"
      >
        &rsaquo;
      </Button>
    </div>
  );
}

function PageButton({
  page,
  current,
  onChange,
}: {
  page: number;
  current: number;
  onChange: (p: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(page)}
      className={cn(
        'h-8 min-w-[2rem] rounded-md px-2 text-sm font-medium transition-colors',
        page === current
          ? 'bg-blue-600 text-white'
          : 'text-gray-600 hover:bg-gray-100',
      )}
      aria-current={page === current ? 'page' : undefined}
    >
      {page}
    </button>
  );
}
