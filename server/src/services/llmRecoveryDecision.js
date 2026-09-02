import {
  GEMINI_RECOVERY_RECOMMENDATION_SCHEMA,
  RECOVERY_AGENT_SYSTEM_PROMPT,
  RECOVERY_RECOMMENDATION_SCHEMA,
} from "../agent/recoveryAgentPrompt.js";
import { analyzeRecoveryCase } from "./recoveryDecisionEngine.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const GEMINI_GENERATE_CONTENT_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export class LlmConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "LlmConfigurationError";
    this.statusCode = 503;
  }
}

export class LlmProviderError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "LlmProviderError";
    this.statusCode = statusCode;
  }
}

function recoveryContext({ recoveryCase, payment, customer }) {
  return {
    customer: {
      name: customer.name,
      lifetimeValue: customer.lifetimeValue,
      successfulPayments: customer.successfulPayments || 0,
      failedPayments: customer.failedPayments || 0,
      previousRecoveryResults: customer.totalRecoveredAmount || 0,
      contactConsent: customer.contactConsent,
    },
    payment: {
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      failureReason: payment.failureReason,
      timestamp: payment.failedAt || payment.createdAt,
    },
    recovery: {
      previousAttempts: recoveryCase.previousAttempts || 0,
      previousActions: recoveryCase.previousActions || [],
      caseAgeMs: recoveryCase.createdAt ? Date.now() - new Date(recoveryCase.createdAt).getTime() : undefined,
    },
  };
}

function parseRecommendation(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new LlmProviderError("The LLM returned no structured recovery recommendation.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new LlmProviderError("The LLM returned invalid structured recovery output.");
  }
}

export async function recommendWithOpenAi(context, {
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || "gpt-4.1-mini",
  timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 10_000),
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw new LlmConfigurationError("OPENAI_API_KEY is required when RECOVERY_AI_PROVIDER=openai.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: RECOVERY_AGENT_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(recoveryContext(context)) },
        ],
        text: { format: { type: "json_schema", name: "recovery_recommendation", strict: true, schema: RECOVERY_RECOMMENDATION_SCHEMA } },
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new LlmProviderError("The LLM provider could not generate a recovery recommendation.", 502);
    return parseRecommendation(body.output_text);
  } catch (error) {
    if (error instanceof LlmConfigurationError || error instanceof LlmProviderError) throw error;
    if (error.name === "AbortError") throw new LlmProviderError("The LLM recommendation request timed out.", 504);
    throw new LlmProviderError("The LLM provider request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

function geminiRecommendationText(body) {
  return body?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("");
}

export async function recommendWithGemini(context, {
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || "gemini-2.5-flash",
  timeoutMs = 10_000,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw new LlmConfigurationError("GEMINI_API_KEY is required when RECOVERY_AI_PROVIDER=gemini.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${GEMINI_GENERATE_CONTENT_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: RECOVERY_AGENT_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(recoveryContext(context)) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: GEMINI_RECOVERY_RECOMMENDATION_SCHEMA,
        },
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new LlmProviderError("The Gemini provider could not generate a recovery recommendation.", 502);
    return parseRecommendation(geminiRecommendationText(body));
  } catch (error) {
    if (error instanceof LlmConfigurationError || error instanceof LlmProviderError) throw error;
    if (error.name === "AbortError") throw new LlmProviderError("The Gemini recommendation request timed out.", 504);
    throw new LlmProviderError("The Gemini provider request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function recommendRecoveryDecision(context, dependencies = {}) {
  const provider = dependencies.provider || process.env.RECOVERY_AI_PROVIDER || "deterministic";
  if (provider === "deterministic") return analyzeRecoveryCase(context);
  if (provider === "openai") return recommendWithOpenAi(context, dependencies);
  if (provider === "gemini") return recommendWithGemini(context, dependencies);
  throw new LlmConfigurationError("RECOVERY_AI_PROVIDER must be deterministic, openai, or gemini.");
}
