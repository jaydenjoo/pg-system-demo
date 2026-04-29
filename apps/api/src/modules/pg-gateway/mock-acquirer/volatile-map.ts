// ============================================================
// VolatileMap — TTL 기반 인메모리 저장소
// 결제 세션 데이터를 일정 시간(기본 30분) 보관 후 자동 만료
// ============================================================

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * TTL(Time-To-Live) 기반 인메모리 Map.
 * get/has 호출 시 만료 항목을 lazy 방식으로 삭제한다.
 * 주기적 GC는 구현하지 않음 — 메모리 효율보다 단순성 우선.
 */
export class VolatileMap<T> {
  private readonly store = new Map<string, Entry<T>>();

  /** 값을 저장한다. ttlMs 후 만료된다. */
  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * 값을 반환한다.
   * 만료된 항목은 삭제 후 undefined를 반환한다.
   */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /** 키를 삭제한다. 존재하면 true, 없으면 false 반환. */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * 키가 존재하는지 확인한다.
   * 만료된 항목은 삭제 후 false를 반환한다.
   */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (entry === undefined) return false;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  /** 모든 항목을 삭제한다. */
  clear(): void {
    this.store.clear();
  }

  /** 만료되지 않은 항목 수를 반환한다. */
  size(): number {
    const now = Date.now();
    let count = 0;
    for (const entry of this.store.values()) {
      if (now <= entry.expiresAt) {
        count++;
      }
    }
    return count;
  }
}
