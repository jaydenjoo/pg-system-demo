import { AsyncLocalStorage } from "node:async_hooks";

/** 요청별 컨텍스트 — AsyncLocalStorage로 스레드 안전하게 요청 ID를 전파. */
interface RequestContext {
  correlationId: string;
}

/**
 * 요청 컨텍스트 저장소 — Node.js AsyncLocalStorage 기반.
 * CorrelationIdMiddleware에서 run()으로 진입, 이후 어디서든 getCorrelationId()로 조회.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/** 현재 요청의 correlationId 조회. 컨텍스트 외부에서 호출 시 "no-correlation-id" 반환. */
export function getCorrelationId(): string {
  return requestContext.getStore()?.correlationId ?? "no-correlation-id";
}
