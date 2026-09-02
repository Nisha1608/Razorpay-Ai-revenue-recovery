import { Router } from "express";

import { AuditLog, Customer, Payment, RecoveryAction, RecoveryCase } from "../models/index.js";
import { RECOVERY_ACTION_TYPES, RECOVERY_CASE_STATUS } from "../constants/recovery.js";

const VALID_SORT_FIELDS = new Set(["amount", "createdAt", "riskScore", "status"]);

function isValidId(value) {
  return /^[a-f\d]{24}$/i.test(value || "");
}

function normalizeListQuery(query) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 25);
  const sortBy = query.sortBy || "createdAt";
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw Object.assign(new Error("page and limit must be valid positive integers; limit cannot exceed 100."), { statusCode: 400 });
  }
  if (!VALID_SORT_FIELDS.has(sortBy)) {
    throw Object.assign(new Error("sortBy must be amount, createdAt, riskScore, or status."), { statusCode: 400 });
  }
  if (query.status && !RECOVERY_CASE_STATUS.includes(query.status)) {
    throw Object.assign(new Error("status is not a valid recovery case status."), { statusCode: 400 });
  }
  if (query.action && !RECOVERY_ACTION_TYPES.includes(query.action)) {
    throw Object.assign(new Error("action is not a valid recovery action type."), { statusCode: 400 });
  }

  return { page, limit, sortBy, sortOrder, search: query.search?.trim().toLowerCase(), status: query.status, action: query.action };
}

function queueAction(recoveryCase) {
  return recoveryCase.activeAction || null;
}

export function buildRecoveryCaseDetail(recoveryCase, latestAction) {
  return {
    recoveryCase,
    customer: recoveryCase.customer,
    payment: recoveryCase.payment,
    action: latestAction || null,
    aiAnalysis: recoveryCase.aiAnalysis || null,
    policyEvaluation: latestAction?.policyEvaluation || null,
    execution: latestAction?.execution || null,
  };
}

function buildJourney(cases) {
  return cases.map((recoveryCase) => ({
    attemptNumber: recoveryCase.attemptNumber || 1,
    status: recoveryCase.status,
    recommendedAction: recoveryCase.recommendedAction,
    recoveredAt: recoveryCase.recoveredAt,
  }));
}

function queueMatches(recoveryCase, query) {
  const action = queueAction(recoveryCase);
  const customerText = [recoveryCase.customer?.name, recoveryCase.customer?.email, recoveryCase.customer?.phone].filter(Boolean).join(" ").toLowerCase();
  return (!query.status || recoveryCase.status === query.status)
    && (!query.action || action?.type === query.action)
    && (!query.search || customerText.includes(query.search));
}

function queueSortValue(recoveryCase, sortBy) {
  if (sortBy === "amount") return recoveryCase.payment?.amount || 0;
  return recoveryCase[sortBy] || 0;
}

function sortQueue(cases, sortBy, sortOrder) {
  const direction = sortOrder === "asc" ? 1 : -1;
  return cases.sort((left, right) => {
    const leftValue = queueSortValue(left, sortBy);
    const rightValue = queueSortValue(right, sortBy);
    return leftValue > rightValue ? direction : leftValue < rightValue ? -direction : 0;
  });
}

export function createRecoveryCaseReadRouter({ models = { AuditLog, Customer, Payment, RecoveryAction, RecoveryCase } } = {}) {
  const router = Router();
  const populatedPaths = ["customer", "payment", "activeAction"];

  router.get("/", async (request, response, next) => {
    try {
      const query = normalizeListQuery(request.query);
      let cases = await models.RecoveryCase.find({}).populate(populatedPaths).lean();
      cases = sortQueue(cases.filter((recoveryCase) => queueMatches(recoveryCase, query)), query.sortBy, query.sortOrder);
      const total = cases.length;
      const start = (query.page - 1) * query.limit;

      response.json({ data: cases.slice(start, start + query.limit), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (request, response, next) => {
    if (!isValidId(request.params.id)) return response.status(400).json({ error: { message: "id must be a valid recovery case ID." } });
    try {
      const recoveryCase = await models.RecoveryCase.findById(request.params.id).populate(populatedPaths).lean();
      if (!recoveryCase) return response.status(404).json({ error: { message: "Recovery case not found." } });

      const latestAction = queueAction(recoveryCase) || await models.RecoveryAction.findOne({ recoveryCase: recoveryCase._id }).sort({ createdAt: -1 }).lean();
      const rootRecoveryCase = recoveryCase.rootRecoveryCase || recoveryCase._id;
      const journeyCases = await models.RecoveryCase.find({ rootRecoveryCase }).sort({ attemptNumber: 1 }).select("attemptNumber status recommendedAction recoveredAt").lean();
      response.json({ ...buildRecoveryCaseDetail(recoveryCase, latestAction), journey: { status: recoveryCase.journeyStatus || "open", attempts: buildJourney(journeyCases) } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/audit", async (request, response, next) => {
    if (!isValidId(request.params.id)) return response.status(400).json({ error: { message: "id must be a valid recovery case ID." } });
    try {
      const recoveryCase = await models.RecoveryCase.findById(request.params.id).select("_id").lean();
      if (!recoveryCase) return response.status(404).json({ error: { message: "Recovery case not found." } });

      const entries = await models.AuditLog.find({ recoveryCase: recoveryCase._id }).populate("action", "type status").sort({ createdAt: 1 }).lean();
      response.json({ data: entries });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createRecoveryCaseReadRouter();
