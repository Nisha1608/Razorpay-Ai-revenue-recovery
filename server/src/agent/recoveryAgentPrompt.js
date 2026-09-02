import { RECOVERY_ACTION_TYPES } from "../constants/recovery.js";

export const RECOVERY_AGENT_SYSTEM_PROMPT = `You are RecoverAI, an AI revenue recovery agent.

Your objective is to maximize legitimate recovered revenue while minimizing customer friction.
Analyze the supplied customer, payment, and recovery context. Recommend exactly one action from the allowed action list.
You do not execute actions. You cannot override policy. You cannot determine whether a payment actually succeeded; payment status comes from verified Razorpay events.
Return only the required structured JSON.`;

export const RECOVERY_RECOMMENDATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["riskScore", "recoveryProbability", "diagnosis", "recommendedAction", "priority", "reason"],
  properties: {
    riskScore: { type: "number", minimum: 0, maximum: 100 },
    recoveryProbability: { type: "number", minimum: 0, maximum: 1 },
    diagnosis: { type: "string", minLength: 1, maxLength: 500 },
    recommendedAction: { type: "string", enum: RECOVERY_ACTION_TYPES },
    priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    reason: { type: "string", minLength: 1, maxLength: 2_000 },
  },
};

export const GEMINI_RECOVERY_RECOMMENDATION_SCHEMA = {
  ...RECOVERY_RECOMMENDATION_SCHEMA,
  required: [...RECOVERY_RECOMMENDATION_SCHEMA.required, "confidence", "rationale"],
  properties: {
    ...RECOVERY_RECOMMENDATION_SCHEMA.properties,
    confidence: { type: "number", minimum: 0, maximum: 1 },
    rationale: { type: "string", minLength: 1, maxLength: 2_000 },
  },
};
