import assert from "node:assert/strict";
import test from "node:test";

import { calculateDashboardMetrics } from "../src/routes/dashboardRoutes.js";
import { buildRecoveryCaseDetail } from "../src/routes/recoveryCaseReadRoutes.js";

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

test("recovery-case detail responses retain persisted probability and priority", () => {
  const recoveryCase = { _id: "507f1f77bcf86cd799439011", recoveryProbability: 0.87, priority: "HIGH", customer: {}, payment: {} };
  const detail = buildRecoveryCaseDetail(recoveryCase, null);

  assert.equal(detail.recoveryCase.recoveryProbability, 0.87);
  assert.equal(detail.recoveryCase.priority, "HIGH");
});
