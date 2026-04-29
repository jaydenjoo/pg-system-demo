import { createHash, timingSafeEqual } from "crypto";

/**
 * SRI(Subresource Integrity) 해시 생성
 * PCI DSS 6.4.3: 결제 페이지 스크립트 무결성 검증
 *
 * @param content - 해시할 스크립트 콘텐츠
 * @returns sha384-{base64hash} 형식의 SRI 해시 문자열
 */
export function generateSriHash(content: string): string {
  const hash = createHash("sha384").update(content, "utf8").digest("base64");
  return `sha384-${hash}`;
}

/**
 * SRI 해시 검증 (timing-safe)
 * 콘텐츠의 해시가 기대값과 일치하는지 확인
 * 타이밍 공격 방지를 위해 crypto.timingSafeEqual 사용
 *
 * @param content - 검증할 스크립트 콘텐츠
 * @param expectedHash - 기대하는 SRI 해시 (sha384-{base64hash} 형식)
 * @returns 해시 일치 여부
 */
export function verifySriHash(content: string, expectedHash: string): boolean {
  const actualHash = generateSriHash(content);

  const actualBuf = Buffer.from(actualHash, "utf8");
  const expectedBuf = Buffer.from(expectedHash, "utf8");

  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(actualBuf, expectedBuf);
}
