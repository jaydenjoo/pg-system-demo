import autocannon from "autocannon";
import { BASE_URL, THRESHOLDS } from "./config";

interface AutocannonResult {
  title: string;
  errors: number;
  timeouts: number;
  non2xx: number;
  latency: { p95: number; p99: number; average: number };
  requests: { average: number; total: number };
  throughput: { average: number };
  duration: number;
  connections: number;
}

function printSummary(result: AutocannonResult): void {
  console.log(`\n--- ${result.title} ---`);
  console.log(`  Connections: ${result.connections}`);
  console.log(`  Duration:    ${result.duration}s`);
  console.log(`  Requests:    ${result.requests.total} total, ${result.requests.average} avg/sec`);
  console.log(`  Latency:     avg=${result.latency.average}ms, p95=${result.latency.p95}ms, p99=${result.latency.p99}ms`);
  console.log(`  Errors:      ${result.errors}, Non-2xx: ${result.non2xx}`);
}

interface ThresholdCheck {
  name: string;
  pass: boolean;
  detail: string;
}

function evaluateThresholds(result: AutocannonResult): ThresholdCheck[] {
  const checks: ThresholdCheck[] = [];
  const totalRequests = result.requests.total;
  const errorCount = result.errors + result.non2xx;
  const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

  checks.push({
    name: "p95 latency",
    pass: result.latency.p95 <= THRESHOLDS.p95_ms,
    detail: `${result.latency.p95}ms (threshold: ${THRESHOLDS.p95_ms}ms)`,
  });

  checks.push({
    name: "p99 latency",
    pass: result.latency.p99 <= THRESHOLDS.p99_ms,
    detail: `${result.latency.p99}ms (threshold: ${THRESHOLDS.p99_ms}ms)`,
  });

  checks.push({
    name: "error rate",
    pass: errorRate <= THRESHOLDS.error_rate_pct,
    detail: `${errorRate.toFixed(2)}% (threshold: ${THRESHOLDS.error_rate_pct}%)`,
  });

  checks.push({
    name: "throughput",
    pass: result.requests.average >= THRESHOLDS.min_rps,
    detail: `${result.requests.average} rps (threshold: ${THRESHOLDS.min_rps} rps)`,
  });

  return checks;
}

async function runScenario(
  title: string,
  url: string,
  options: {
    connections: number;
    duration: number;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<AutocannonResult> {
  console.log(`\nRunning: ${title}`);
  console.log(`  URL: ${url}`);
  console.log(`  ${options.connections} connections for ${options.duration}s`);

  const result = (await autocannon({
    url,
    connections: options.connections,
    duration: options.duration,
    title,
    method: (options.method as "GET" | "POST") ?? "GET",
    headers: options.headers,
    body: options.body,
  })) as unknown as AutocannonResult;

  printSummary(result);
  return result;
}

async function run(): Promise<void> {
  console.log("=== LOAD TEST ===");
  console.log(`Target: ${BASE_URL}`);
  console.log(`Thresholds: p95<${THRESHOLDS.p95_ms}ms, p99<${THRESHOLDS.p99_ms}ms, errors<${THRESHOLDS.error_rate_pct}%, rps>${THRESHOLDS.min_rps}`);

  const results: { scenario: string; checks: ThresholdCheck[] }[] = [];

  // Scenario 1: Health Check — 기본 부하
  const healthResult = await runScenario(
    "Health Check (baseline)",
    `${BASE_URL}/api/v1/health`,
    { connections: 10, duration: 30 },
  );
  results.push({
    scenario: "Health Check",
    checks: evaluateThresholds(healthResult),
  });

  // Scenario 2: Health Ready — DB 연결 포함
  const readyResult = await runScenario(
    "Health Ready (DB included)",
    `${BASE_URL}/api/v1/health/ready`,
    { connections: 10, duration: 30 },
  );
  results.push({
    scenario: "Health Ready",
    checks: evaluateThresholds(readyResult),
  });

  // === Report ===
  console.log("\n\n========== LOAD TEST REPORT ==========\n");

  let allPassed = true;

  for (const { scenario, checks } of results) {
    console.log(`[${scenario}]`);
    for (const check of checks) {
      const icon = check.pass ? "PASS" : "FAIL";
      console.log(`  ${icon}: ${check.name} — ${check.detail}`);
      if (!check.pass) allPassed = false;
    }
    console.log();
  }

  if (allPassed) {
    console.log("RESULT: All load test thresholds met");
  } else {
    console.log("RESULT: Some thresholds exceeded — review above");
    process.exit(1);
  }
}

void run();
