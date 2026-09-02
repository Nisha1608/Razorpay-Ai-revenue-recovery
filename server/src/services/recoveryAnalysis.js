import { AuditLog, Customer, Payment, RecoveryAction, RecoveryCase } from "../models/index.js";
import { RECOVERY_ACTION_TYPES } from "../constants/recovery.js";
import { analyzeRecoveryCase } from "./recoveryDecisionEngine.js";
import { evaluateRecoveryPolicy } from "./recoveryPolicy.js";
import { LlmConfigurationError, LlmProviderError, recommendRecoveryDecision } from "./llmRecoveryDecision.js";

function createError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function isExpectedAiDecisionFailure(error) {
  return error instanceof LlmConfigurationError
    || error instanceof LlmProviderError
    || error?.name === "LlmConfigurationError"
    || error?.name === "LlmProviderError"
    || error?.statusCode === 422;
}

export function validateRecoveryDecision(decision) {
  if (!Number.isFinite(decision?.riskScore) || decision.riskScore < 0 || decision.riskScore > 100) {
    throw createError("Recovery analysis returned an invalid risk score.", 422);
  }
  if (!Number.isFinite(decision?.recoveryProbability) || decision.recoveryProbability < 0 || decision.recoveryProbability > 1) {
    throw createError("Recovery analysis returned an invalid recovery probability.", 422);
  }
  if (!["LOW", "MEDIUM", "HIGH"].includes(decision?.priority)) {
    throw createError("Recovery analysis returned an invalid priority.", 422);
  }
  if (!RECOVERY_ACTION_TYPES.includes(decision?.recommendedAction)) {
    throw createError("Recovery analysis returned an invalid action.", 422);
  }
  if (typeof decision?.diagnosis !== "string" || !decision.diagnosis.trim() || decision.diagnosis.length > 500) {
    throw createError("Recovery analysis returned an invalid diagnosis.", 422);
  }
  if (typeof decision?.reason !== "string" || !decision.reason.trim() || decision.reason.length > 2_000) {
    throw createError("Recovery analysis returned an invalid reason.", 422);
  }
}

export async function analyzeAndRecommendRecovery(recoveryCaseId, dependencies = {}) {
  const models = { AuditLog, Customer, Payment, RecoveryAction, RecoveryCase, ...dependencies.models };
  const decide = dependencies.decide || recommendRecoveryDecision;
  const fallbackDecide = dependencies.fallbackDecide || analyzeRecoveryCase;
  const evaluate = dependencies.evaluate || evaluateRecoveryPolicy;
  const provider = dependencies.provider || process.env.RECOVERY_AI_PROVIDER || "deterministic";
  const recoveryCase = await models.RecoveryCase.findById(recoveryCaseId);

  if (!recoveryCase) throw createError("Recovery case not found.", 404);
  if (["recovered", "closed"].includes(recoveryCase.status)) throw createError("Closed recovery cases cannot be analyzed.", 409);

  const existingAction = await models.RecoveryAction.findOne({ recoveryCase: recoveryCase._id, source: "ai" });
  if (existingAction) return { recoveryCase, action: existingAction, duplicate: true };

  recoveryCase.status = "analyzing";
  await recoveryCase.save();

  const [payment, customer] = await Promise.all([
    models.Payment.findById(recoveryCase.payment),
    models.Customer.findById(recoveryCase.customer),
  ]);
  if (!payment || !customer) throw createError("Recovery case is missing its payment or customer.", 409);

  let decision;
  let analysisSource = provider === "openai"
    ? "OPENAI"
    : provider === "gemini"
      ? "GEMINI"
      : "DETERMINISTIC";
  try {
    try {
      decision = await decide({ recoveryCase, payment, customer });
      validateRecoveryDecision(decision);
    } catch (error) {
      if (!isExpectedAiDecisionFailure(error)) throw error;

      await models.AuditLog.create([{
        recoveryCase: recoveryCase._id,
        payment: payment._id,
        actor: "ai",
        eventType: "AI_ANALYSIS_FALLBACK",
        message: "LLM recovery analysis was unavailable or invalid; deterministic analysis was used.",
        metadata: { fallback: "deterministic", failureType: error.name || "RecoveryDecisionValidationError" },
      }]);
      decision = await fallbackDecide({ recoveryCase, payment, customer });
      validateRecoveryDecision(decision);
      analysisSource = "DETERMINISTIC_FALLBACK";
    }
  } catch (error) {
    recoveryCase.status = "open";
    await recoveryCase.save();
    await models.AuditLog.create([{
      recoveryCase: recoveryCase._id,
      payment: payment._id,
      actor: "ai",
      eventType: "AI_ANALYSIS_FAILED",
      message: error.statusCode === 422 ? error.message : "AI recovery analysis could not produce a valid recommendation.",
    }]);
    throw error;
  }
  const policy = evaluate({ action: decision.recommendedAction, payment, customer, recoveryCase });
  const action = await models.RecoveryAction.create({
    recoveryCase: recoveryCase._id,
    type: decision.recommendedAction,
    status: "pending",
    source: "ai",
    rationale: decision.rationale,
    confidence: decision.confidence,
    policyEvaluation: { ...policy, evaluatedAt: new Date() },
  });

  recoveryCase.status = "action_pending";
  recoveryCase.riskScore = decision.riskScore;
  recoveryCase.recoveryProbability = decision.recoveryProbability;
  recoveryCase.priority = decision.priority;
  recoveryCase.aiAnalysis = {
    summary: decision.reason,
    diagnosis: decision.diagnosis,
    reason: decision.reason,
    confidence: decision.confidence ?? decision.recoveryProbability,
    analyzedAt: new Date(),
  };
  recoveryCase.recommendedAction = action.type;
  recoveryCase.activeAction = action._id;
  await recoveryCase.save();

  await models.AuditLog.create([
    {
      recoveryCase: recoveryCase._id,
      payment: payment._id,
      action: action._id,
      actor: "ai",
      eventType: "AI_ANALYSIS",
      message: `AI recommended ${action.type}.`,
      metadata: { analysisSource },
      after: { riskScore: decision.riskScore, recoveryProbability: decision.recoveryProbability, priority: decision.priority, confidence: decision.confidence, recommendedAction: action.type },
    },
    {
      recoveryCase: recoveryCase._id,
      payment: payment._id,
      action: action._id,
      actor: "policy",
      eventType: "POLICY_EVALUATED",
      message: policy.reason,
      after: { allowed: policy.allowed, action: action.type },
    },
  ]);

  return { recoveryCase, action, duplicate: false };
}
