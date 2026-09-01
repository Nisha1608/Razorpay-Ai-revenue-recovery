import { Router } from "express";

import { Payment, RecoveryAction, RecoveryCase } from "../models/index.js";

const TERMINAL_CASE_STATUSES = ["recovered", "closed"];

export function calculateDashboardMetrics({ unresolvedCases, recoveredCases, executedActions, successfulActions }) {
  const revenueAtRisk = unresolvedCases.reduce((total, recoveryCase) => total + (recoveryCase.payment?.amount || 0), 0);
  const revenueRecovered = recoveredCases.reduce((total, recoveryCase) => total + (recoveryCase.recoveredAmount || 0), 0);
  const startingRisk = revenueAtRisk + revenueRecovered;
  const recoveryDurations = recoveredCases
    .filter((recoveryCase) => recoveryCase.recoveredAt && recoveryCase.createdAt)
    .map((recoveryCase) => new Date(recoveryCase.recoveredAt) - new Date(recoveryCase.createdAt))
    .filter((duration) => duration >= 0);

  return {
    revenueAtRisk,
    revenueRecovered,
    recoveryRate: startingRisk ? Number((revenueRecovered / startingRisk).toFixed(4)) : 0,
    activeRecoveryCases: unresolvedCases.length,
    executedActions,
    successfulActions,
    averageRecoveryTime: recoveryDurations.length
      ? Math.round(recoveryDurations.reduce((total, duration) => total + duration, 0) / recoveryDurations.length)
      : 0,
  };
}

export function createDashboardRouter({ models = { Payment, RecoveryAction, RecoveryCase } } = {}) {
  const router = Router();

  router.get("/metrics", async (_request, response, next) => {
    try {
      const [unresolvedCases, recoveredCases, executedActions] = await Promise.all([
        models.RecoveryCase.find({ status: { $nin: TERMINAL_CASE_STATUSES } }).populate("payment", "amount").lean(),
        models.RecoveryCase.find({ status: "recovered" }).lean(),
        models.RecoveryAction.countDocuments({ status: "executed" }),
      ]);
      const recoveredCaseIds = recoveredCases.map((recoveryCase) => recoveryCase._id);
      const successfulActions = recoveredCaseIds.length
        ? await models.RecoveryAction.countDocuments({ status: "executed", recoveryCase: { $in: recoveredCaseIds } })
        : 0;

      response.json(calculateDashboardMetrics({ unresolvedCases, recoveredCases, executedActions, successfulActions }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createDashboardRouter();
