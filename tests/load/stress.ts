import autocannon from "autocannon";
import { BASE_URL } from "./config";

interface AutocannonResult {
  title: string;
  errors: number;
  timeouts: number;
  non2xx: number;
  latency: { p95: number; p99: number; average: number; min: number; max: number };
  requests: { average: number; total: number; min: number; max: number };
  throughput: { average: number };
  duration: number;
  connections: number;
}

interface StageResult {
  stage: string;
  connections: number;
  rps: number;
  p95: number;
  p99: number;
  errors: number;
  non2xx: number;
  errorRate: number;
}

const STRESS_STAGES = [
  { connections: 10, duration: 20, label: "Warm-up (10 conn)" },
  { connections: 50, duration: 20, label: "Normal (50 conn)" },
  { connections: 100, duration: 20, label: "High (100 conn)" },
  { connections: 200, duration: 20, label: "Peak (200 conn)" },
];

const BREAK_THRESHOLD = {
  error_rate_pct: 5,
  p95_ms: 2000,
};

async function runStage(
  label: string,
  connections: number,
  duration: number,
): Promise<StageResult> {
  console.log(`\n--- Stage: ${label} ---`);

  const result = (await autocannon({
    url: `${BASE_URL}/api/v1/health`,
    connections,
    duration,
    title: label,
  })) as unknown as AutocannonResult;

  const totalRequests = result.requests.total;
  const errorCount = result.errors + result.non2xx;
  const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

  const stageResult: StageResult = {
    stage: label,
    connections,
    rps: result.requests.average,
    p95: result.latency.p95,
    p99: result.latency.p99,
    errors: result.errors,
    non2xx: result.non2xx,
    errorRate,
  };

  console.log(`  RPS:     ${stageResult.rps}`);
  console.log(`  Latency: p95=${stageResult.p95}ms, p99=${stageResult.p99}ms`);
  console.log(`  Errors:  ${stageResult.errors} (${stageResult.errorRate.toFixed(2)}%)`);

  return stageResult;
}

function printReport(results: StageResult[]): void {
  console.log("\n\n========== STRESS TEST REPORT ==========\n");
  console.log(
    "Stage".padEnd(25) +
      "Conn".padEnd(8) +
      "RPS".padEnd(10) +
      "p95(ms)".padEnd(10) +
      "p99(ms)".padEnd(10) +
      "Errors".padEnd(10) +
      "Status",
  );
  console.log("-".repeat(83));

  for (const r of results) {
    const broken =
      r.errorRate > BREAK_THRESHOLD.error_rate_pct ||
      r.p95 > BREAK_THRESHOLD.p95_ms;
    const status = broken ? "BREAKING" : "OK";

    console.log(
      r.stage.padEnd(25) +
        String(r.connections).padEnd(8) +
        String(r.rps).padEnd(10) +
        String(r.p95).padEnd(10) +
        String(r.p99).padEnd(10) +
        `${r.errors} (${r.errorRate.toFixed(1)}%)`.padEnd(10) +
        status,
    );
  }

  // Find breaking point
  const breakingStage = results.find(
    (r) =>
      r.errorRate > BREAK_THRESHOLD.error_rate_pct ||
      r.p95 > BREAK_THRESHOLD.p95_ms,
  );

  console.log("\n--- Summary ---");
  if (breakingStage) {
    console.log(
      `Breaking point: ${breakingStage.stage} (${breakingStage.connections} connections)`,
    );
    console.log(
      `  Error rate: ${breakingStage.errorRate.toFixed(2)}% (threshold: ${BREAK_THRESHOLD.error_rate_pct}%)`,
    );
    console.log(
      `  p95 latency: ${breakingStage.p95}ms (threshold: ${BREAK_THRESHOLD.p95_ms}ms)`,
    );
  } else {
    console.log(
      `System handled all stages up to ${STRESS_STAGES[STRESS_STAGES.length - 1]?.connections ?? 0} connections without breaking.`,
    );
  }

  const maxRps = Math.max(...results.map((r) => r.rps));
  const maxRpsStage = results.find((r) => r.rps === maxRps);
  if (maxRpsStage) {
    console.log(
      `Peak throughput: ${maxRps} rps at ${maxRpsStage.connections} connections`,
    );
  }
}

async function run(): Promise<void> {
  console.log("=== STRESS TEST ===");
  console.log(`Target: ${BASE_URL}/api/v1/health`);
  console.log(
    `Stages: ${STRESS_STAGES.map((s) => `${s.connections}conn`).join(" → ")}`,
  );
  console.log(
    `Break threshold: error>${BREAK_THRESHOLD.error_rate_pct}% OR p95>${BREAK_THRESHOLD.p95_ms}ms`,
  );

  const results: StageResult[] = [];

  for (const stage of STRESS_STAGES) {
    const result = await runStage(
      stage.label,
      stage.connections,
      stage.duration,
    );
    results.push(result);

    // 한계점 도달 시 조기 중단
    if (
      result.errorRate > BREAK_THRESHOLD.error_rate_pct ||
      result.p95 > BREAK_THRESHOLD.p95_ms
    ) {
      console.log(`\nBreaking point reached at ${stage.label}. Stopping.`);
      break;
    }
  }

  printReport(results);
}

void run();
