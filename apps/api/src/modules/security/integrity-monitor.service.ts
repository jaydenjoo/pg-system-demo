import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { readFile, stat } from "fs/promises";
import { resolve } from "path";
import { Prisma } from "@prisma/client";
import {
  FileHashRecord,
  IntegrityCheckResult,
  FileChangeDetail,
  INTEGRITY_MONITOR,
} from "@pg-system/shared";

/** Prisma JSON 컬럼 입출력 타입 변환 헬퍼 — `as unknown as` 캐스팅을 한 곳에 격리 */
function toJsonValue(data: unknown): Prisma.InputJsonValue {
  return data as unknown as Prisma.InputJsonValue;
}
function fromJsonValue<T>(json: unknown): T {
  return json as unknown as T;
}

/**
 * @description 파일 무결성 모니터링(FIM) 서비스.
 * 핵심 파일의 SHA-256 해시를 베이스라인으로 저장하고,
 * 주기적 검사로 변경/신규/삭제 파일을 탐지.
 * 변조 감지 시 audit_logs에 FIM_ALERT를 기록.
 * @security PCI DSS 11.5 — 파일 무결성 모니터링 (FIM) 구현
 * @security PCI DSS 10.5.5 — 보안 관련 파일 변경 감지
 * @audit 베이스라인 업데이트 시 FIM_BASELINE, 변경 탐지 시 FIM_ALERT 기록
 */
@Injectable()
export class IntegrityMonitorService {
  private readonly logger = new Logger(IntegrityMonitorService.name);
  private readonly projectRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.projectRoot = this.config.get<string>(
      "app.projectRoot",
      process.cwd(),
    );
  }

  /**
   * @description 단일 파일의 SHA-256 해시를 계산.
   * @param {string} filePath - 프로젝트 루트 기준 상대 경로
   * @returns {Promise<string>} 64자 hex SHA-256 해시
   * @security PCI DSS 11.5 — 파일 해시 기반 무결성 검증
   */
  async computeFileHash(filePath: string): Promise<string> {
    const absolutePath = resolve(this.projectRoot, filePath);
    const content = await readFile(absolutePath);
    return createHash(INTEGRITY_MONITOR.ALGORITHM)
      .update(content)
      .digest("hex");
  }

  /**
   * @description 여러 파일의 해시를 일괄 스캔하여 FileHashRecord 배열 생성.
   * 파일 크기 초과(MAX_FILE_SIZE_BYTES) 시 스킵, 접근 불가 시 경고 로그만 남기고 계속 진행.
   * @param {readonly string[]} paths - 스캔 대상 파일 경로 목록 (프로젝트 루트 기준)
   * @returns {Promise<FileHashRecord[]>} 각 파일의 해시·크기·수정시각 정보
   * @security PCI DSS 11.5 — 핵심 파일 해시 일괄 수집
   */
  async scanFiles(paths: readonly string[]): Promise<FileHashRecord[]> {
    const now = new Date().toISOString();
    const records: FileHashRecord[] = [];

    for (const filePath of paths) {
      try {
        const absolutePath = resolve(this.projectRoot, filePath);
        const fileStat = await stat(absolutePath);

        if (fileStat.size > INTEGRITY_MONITOR.MAX_FILE_SIZE_BYTES) {
          this.logger.warn(
            `파일 크기 초과로 스킵: ${filePath} (${fileStat.size} bytes)`,
          );
          continue;
        }

        const hash = await this.computeFileHash(filePath);
        records.push({
          filePath,
          algorithm: INTEGRITY_MONITOR.ALGORITHM,
          hash,
          fileSize: fileStat.size,
          lastModified: fileStat.mtime.toISOString(),
          checkedAt: now,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`파일 접근 불가: ${filePath} — ${message}`);
      }
    }

    return records;
  }

  /**
   * @description 현재 핵심 파일 해시를 베이스라인과 비교하여 변경/신규/삭제 파일 탐지.
   * 변경 감지 시 audit_logs에 FIM_ALERT를 자동 기록.
   * @returns {Promise<IntegrityCheckResult>} 검사 결과 (PASS/FAIL/ERROR, 변경 상세)
   * @security PCI DSS 11.5 — 파일 무결성 변경 탐지 및 알림
   * @audit 변경 발견 시 FIM_ALERT 감사 로그 자동 생성
   */
  async checkIntegrity(): Promise<IntegrityCheckResult> {
    const now = new Date().toISOString();

    try {
      const baseline = await this.getBaseline();
      const currentRecords = await this.scanFiles(
        INTEGRITY_MONITOR.CRITICAL_PATHS,
      );

      if (baseline.length === 0) {
        return {
          status: "PASS",
          checkedAt: now,
          totalFiles: currentRecords.length,
          changedFiles: [],
          newFiles: currentRecords.map((r) => r.filePath),
          deletedFiles: [],
        };
      }

      const baselineMap = new Map(baseline.map((r) => [r.filePath, r]));
      const currentMap = new Map(currentRecords.map((r) => [r.filePath, r]));

      const changedFiles: FileChangeDetail[] = [];
      const newFiles: string[] = [];
      const deletedFiles: string[] = [];

      // 변경/신규 파일 탐지
      for (const [path, current] of currentMap) {
        const prev = baselineMap.get(path);
        if (prev === undefined) {
          newFiles.push(path);
        } else if (prev.hash !== current.hash) {
          changedFiles.push({
            filePath: path,
            previousHash: prev.hash,
            currentHash: current.hash,
            changeDetectedAt: now,
          });
        }
      }

      // 삭제된 파일 탐지
      for (const path of baselineMap.keys()) {
        if (!currentMap.has(path)) {
          deletedFiles.push(path);
        }
      }

      const hasChanges =
        changedFiles.length > 0 ||
        newFiles.length > 0 ||
        deletedFiles.length > 0;

      const result: IntegrityCheckResult = {
        status: hasChanges ? "FAIL" : "PASS",
        checkedAt: now,
        totalFiles: currentRecords.length,
        changedFiles,
        newFiles,
        deletedFiles,
      };

      if (hasChanges) {
        await this.recordAlert(result);
      }

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`무결성 검사 실패: ${message}`);
      return {
        status: "ERROR",
        checkedAt: now,
        totalFiles: 0,
        changedFiles: [],
        newFiles: [],
        deletedFiles: [],
      };
    }
  }

  /**
   * @description 마지막 무결성 검사 결과를 DB에서 조회 (스캔 실행 없이 기록만 반환).
   * @returns {Promise<IntegrityCheckResult | null>} 최근 검사 결과, 기록 없으면 null
   */
  async getLastCheckResult(): Promise<IntegrityCheckResult | null> {
    const latest = await this.prisma.audit_logs.findFirst({
      where: {
        action: { in: ["FIM_ALERT", "FIM_CHECK_PASS"] },
        resource_type: "INTEGRITY",
      },
      orderBy: { created_at: "desc" },
    });

    if (!latest?.detail) {
      return null;
    }

    return fromJsonValue<IntegrityCheckResult>(latest.detail);
  }

  /**
   * @description 현재 핵심 파일 해시를 새 베이스라인으로 저장.
   * 배포·패치 후 관리자가 의도적으로 베이스라인을 갱신할 때 사용.
   * @param {string} userId - 베이스라인 갱신 관리자 ID (감사 추적용)
   * @returns {Promise<void>}
   * @security PCI DSS 10.2 — 관리자 행위(베이스라인 갱신) 기록
   * @audit FIM_BASELINE 감사 로그 생성 (userId 포함)
   */
  async updateBaseline(userId: string): Promise<void> {
    const records = await this.scanFiles(INTEGRITY_MONITOR.CRITICAL_PATHS);

    await this.prisma.audit_logs.create({
      data: {
        action: "FIM_BASELINE",
        resource_type: "INTEGRITY",
        user_id: userId,
        detail: toJsonValue(records),
      },
    });

    this.logger.log(
      `FIM 베이스라인 업데이트 완료: ${records.length}개 파일 (by ${userId})`,
    );
  }

  /**
   * @description 현재 저장된 베이스라인 조회 (최신 FIM_BASELINE audit_log 레코드).
   * @returns {Promise<FileHashRecord[]>} 베이스라인 파일 해시 목록, 없으면 빈 배열
   */
  async getBaseline(): Promise<FileHashRecord[]> {
    const latest = await this.prisma.audit_logs.findFirst({
      where: {
        action: "FIM_BASELINE",
        resource_type: "INTEGRITY",
      },
      orderBy: { created_at: "desc" },
    });

    if (!latest?.detail) {
      return [];
    }

    return fromJsonValue<FileHashRecord[]>(latest.detail);
  }

  /** 변경 탐지 시 audit_logs에 FIM_ALERT 기록 */
  private async recordAlert(result: IntegrityCheckResult): Promise<void> {
    await this.prisma.audit_logs.create({
      data: {
        action: "FIM_ALERT",
        resource_type: "INTEGRITY",
        detail: toJsonValue({
          changedFiles: result.changedFiles,
          newFiles: result.newFiles,
          deletedFiles: result.deletedFiles,
          checkedAt: result.checkedAt,
        }),
      },
    });

    this.logger.warn(
      `FIM 알림: 변경 ${result.changedFiles.length}개, ` +
        `신규 ${result.newFiles.length}개, ` +
        `삭제 ${result.deletedFiles.length}개`,
    );
  }
}
