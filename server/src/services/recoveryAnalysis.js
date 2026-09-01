import { AuditLog, Customer, Payment, RecoveryAction, RecoveryCase } from "../models/index.js";
import { analyzeRecoveryCase } from "./recoveryDecisionEngine.js";
import { evaluateRecoveryPolicy } from "./recoveryPolicy.js";

function createError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

export async function analyzeAndRecommendRecovery(recoveryCaseId, dependencies = {}) {
  const models = { AuditLog, Customer, Payment, RecoveryAction, RecoveryCase, ...dependencies.models };
  const decide = dependencies.decide || analyzeRecoveryCase;
  const evaluate = dependencies.evaluate || evaluateRecoveryPolicy;
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

  const decision = decide({ recoveryCase, payment, customer });
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
  recoveryCase.aiAnalysis = { summary: decision.rationale, confidence: decision.confidence, analyzedAt: new Date() };
  recoveryCase.recommendedAction = action._id;
  await recoveryCase.save();

  await models.AuditLog.create([
    {
      recoveryCase: recoveryCase._id,
      payment: payment._id,
      action: action._id,
      actor: "ai",
      eventType: "AI_ANALYSIS",
      message: `AI recommended ${action.type}.`,
      after: { riskScore: decision.riskScore, confidence: decision.confidence, recommendedAction: action.type },
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

