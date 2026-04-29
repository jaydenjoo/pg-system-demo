import autocannon from "autocannon";
import { BASE_URL, THRESHOLDS } from "./config";

interface AutocannonResult {
  title: string;
  errors: number;
  timeouts: number;
  latency: { p95: number; p99: number; average: number };
  requests: { average: number; total: number };
  throughput: { average: number };
  duration: number;
  connections: number;
}

function printSummary(result: AutocannonResult): void {
  console.log("\n=== SMOKE TEST RESULTS ===");
  console.log(`Title:       ${result.title}`);
  console.log(`Duration:    ${result.duration}s`);
  console.log(`Connections: ${result.connections}`);
  console.log(`Requests:    ${result.requests.total} total, ${result.requests.average} avg/sec`);
  console.log(`Latency:     avg=${result.latency.average}ms, p95=${result.latency.p95}ms, p99=${result.latency.p99}ms`);
  console.log(`Errors:      ${result.errors}`);
  console.log(`Timeouts:    ${result.timeouts}`);
}

function checkThresholds(result: AutocannonResult): boolean {
  let passed = true;

  if (result.errors > 0) {
    console.error(`FAIL: ${result.errors} errors detected`);
    passed = false;
  }

  if (result.latency.p95 > THRESHOLDS.p95_ms) {
    console.error(
      `FAIL: p95 latency ${result.latency.p95}ms exceeds threshold ${THRESHOLDS.p95_ms}ms`,
    );
    passed = false;
  }

  if (passed) {
    console.log("\nPASS: All smoke test thresholds met");
  }

  return passed;
}

async function run(): Promise<void> {
  console.log(`Smoke test targeting ${BASE_URL}/api/v1/health`);
  console.log("Configuration: 1 connection, 10 seconds\n");

  const result = (await autocannon({
    url: `${BASE_URL}/api/v1/health`,
    connections: 1,
    duration: 10,
    title: "Smoke Test — Health Check",
  })) as unknown as AutocannonResult;

  printSummary(result);
  const passed = checkThresholds(result);

  if (!passed) {
    process.exit(1);
  }
}

void run();
