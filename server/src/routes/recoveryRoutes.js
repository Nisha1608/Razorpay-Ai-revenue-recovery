import { Router } from "express";

import { approveRecoveryAction, executeRecoveryAction } from "../services/recoveryActionService.js";
import { analyzeAndRecommendRecovery } from "../services/recoveryAnalysis.js";

function isValidId(value) {
  return /^[a-f\d]{24}$/i.test(value || "");
}

function isEnabled(environment = process.env.NODE_ENV) {
  return environment !== "production";
}

const recoveryRouter = Router();

recoveryRouter.use((request, response, next) => {
  if (!isEnabled()) return response.status(404).json({ error: { message: "Route not found." } });
  next();
});

recoveryRouter.post("/:recoveryCaseId/analyze", async (request, response, next) => {
  if (!isValidId(request.params.recoveryCaseId)) return response.status(400).json({ error: { message: "recoveryCaseId must be a valid ID." } });
  try {
    const result = await analyzeAndRecommendRecovery(request.params.recoveryCaseId);
    response.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

recoveryRouter.post("/actions/:actionId/approve", async (request, response, next) => {
  if (!isValidId(request.params.actionId)) return response.status(400).json({ error: { message: "actionId must be a valid ID." } });
  const approvedBy = typeof request.body?.approvedBy === "string" && request.body.approvedBy.trim() ? request.body.approvedBy.trim() : "development-user";
  try {
    response.json({ action: await approveRecoveryAction(request.params.actionId, approvedBy) });
  } catch (error) { next(error); }
});

recoveryRouter.post("/actions/:actionId/execute", async (request, response, next) => {
  if (!isValidId(request.params.actionId)) return response.status(400).json({ error: { message: "actionId must be a valid ID." } });
  try {
    response.json(await executeRecoveryAction(request.params.actionId));
  } catch (error) { next(error); }
});

export default recoveryRouter;
