import assert from "node:assert/strict";
import test from "node:test";

import { calculateDashboardMetrics } from "../src/routes/dashboardRoutes.js";

test("dashboard metrics use only persisted case, payment, and action state", () => {
  const metrics = calculateDashboardMetrics({
    unresolvedCases: [{ payment: { amount: 12_500 } }, { payment: { amount: 7_500 } }],
    recoveredCases: [
      { recoveredAmount: 10_000, createdAt: "2026-01-01T00:00:00Z", recoveredAt: "2026-01-01T01:00:00Z" },
      { recoveredAmount: 500, createdAt: "2026-01-02T01:00:00Z", recoveredAt: "2026-01-02T00:00:00Z" },
    ],
    executedActions: 3,
    successfulActions: 1,
  });

  assert.deepEqual(metrics, {
    revenueAtRisk: 20_000,
    revenueRecovered: 10_500,
    recoveryRate: 0.3443,
    activeRecoveryCases: 2,
    executedActions: 3,
    successfulActions: 1,
    averageRecoveryTime: 3_600_000,
  });
});
