import "dotenv/config";
import { performance } from "node:perf_hooks";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3001";
const API_BASE = `${BASE_URL.replace(/\/+$/, "")}/api`;

const ITERATIONS = Number(process.env.STAGE10_HTTP_ITERATIONS ?? "40");
const WARMUP = Number(process.env.STAGE10_HTTP_WARMUP ?? "5");
const CATALOG_P95_SLO_MS = Number(process.env.STAGE10_CATALOG_P95_SLO_MS ?? "200");
const ADMIN_COMPLAINTS_P95_SLO_MS = Number(
  process.env.STAGE10_ADMIN_COMPLAINTS_P95_SLO_MS ?? "350",
);

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const normalized = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((p / 100) * normalized.length);
  return normalized[Math.max(0, Math.min(normalized.length - 1, rank - 1))];
}

function summarizeLatency(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    count: values.length,
    min: Number(min.toFixed(3)),
    max: Number(max.toFixed(3)),
    avg: Number(avg.toFixed(3)),
    p50: Number(percentile(values, 50).toFixed(3)),
    p95: Number(percentile(values, 95).toFixed(3)),
  };
}

async function apiRequest(method, path, options = {}) {
  const { headers = {}, body, expected = [200] } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!expected.includes(response.status)) {
    throw new Error(
      `${method} ${path} -> ${response.status}\n${typeof data === "string" ? data : JSON.stringify(data, null, 2)}`,
    );
  }

  return { status: response.status, data };
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function collectLatency(params) {
  const { name, path, headers } = params;
  const samples = [];

  for (let index = 0; index < WARMUP + ITERATIONS; index += 1) {
    const startedAt = performance.now();
    await apiRequest("GET", path, { headers, expected: [200] });
    const elapsedMs = performance.now() - startedAt;
    if (index >= WARMUP) {
      samples.push(elapsedMs);
    }
  }

  return {
    name,
    path,
    summary: summarizeLatency(samples),
  };
}

async function main() {
  invariant(ITERATIONS >= 10, "STAGE10_HTTP_ITERATIONS must be >= 10");
  invariant(WARMUP >= 0, "STAGE10_HTTP_WARMUP must be >= 0");

  const adminLogin = await apiRequest("POST", "/auth/login", {
    headers: { "content-type": "application/json" },
    body: { email: "admin@ecomm.local", password: "admin123" },
    expected: [200],
  });
  const adminToken = String(adminLogin.data?.sessionToken ?? "").trim();
  invariant(adminToken.length > 0, "admin sessionToken is required for latency benchmark");

  const [catalogLatency, adminComplaintsLatency] = await Promise.all([
    collectLatency({
      name: "catalog_list",
      path: "/catalog/listings?type=products&limit=24&offset=0",
      headers: {},
    }),
    collectLatency({
      name: "admin_complaints_filtered",
      path: "/admin/complaints?page=1&pageSize=20&status=new,pending&sortBy=createdAt&sortOrder=desc",
      headers: authHeaders(adminToken),
    }),
  ]);

  const catalogP95 = catalogLatency.summary.p95;
  const adminComplaintsP95 = adminComplaintsLatency.summary.p95;

  invariant(
    catalogP95 <= CATALOG_P95_SLO_MS,
    `catalog p95 ${catalogP95}ms exceeds SLO ${CATALOG_P95_SLO_MS}ms`,
  );
  invariant(
    adminComplaintsP95 <= ADMIN_COMPLAINTS_P95_SLO_MS,
    `admin complaints p95 ${adminComplaintsP95}ms exceeds SLO ${ADMIN_COMPLAINTS_P95_SLO_MS}ms`,
  );

  const report = {
    scenario: "stage10_http_p95",
    result: "PASS",
    config: {
      baseUrl: BASE_URL,
      iterations: ITERATIONS,
      warmup: WARMUP,
      sloMs: {
        catalogP95: CATALOG_P95_SLO_MS,
        adminComplaintsP95: ADMIN_COMPLAINTS_P95_SLO_MS,
      },
    },
    endpoints: [catalogLatency, adminComplaintsLatency],
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
