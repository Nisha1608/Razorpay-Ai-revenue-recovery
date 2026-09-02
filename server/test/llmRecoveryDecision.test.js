import assert from "node:assert/strict";
import test from "node:test";

import {
  LlmConfigurationError,
  LlmProviderError,
  recommendRecoveryDecision,
  recommendWithGemini,
  recommendWithOpenAi,
} from "../src/services/llmRecoveryDecision.js";

const context = {
  recoveryCase: { createdAt: new Date("2026-09-01T00:00:00Z") },
  customer: { name: "Aman Test", successfulPayments: 3, failedPayments: 1 },
  payment: { amount: 125_000, currency: "INR", failureReason: "Card declined" },
};

const validRecommendation = {
  riskScore: 72,
  recoveryProbability: 0.84,
  diagnosis: "The payment failed after a strong payment history.",
  recommendedAction: "CREATE_PAYMENT_LINK",
  priority: "HIGH",
  reason: "A new payment method should reduce friction for this customer.",
};

function successFetch(outputText) {
  return async () => ({ ok: true, json: async () => ({ output_text: outputText }) });
}

const validGeminiRecommendation = { ...validRecommendation, confidence: 0.84, rationale: validRecommendation.reason };

function geminiSuccessFetch(outputText) {
  return async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: outputText }] } }] }),
  });
}

test("OpenAI recovery service returns a valid structured recommendation", async () => {
  const decision = await recommendWithOpenAi(context, { apiKey: "test-key", fetchImpl: successFetch(JSON.stringify(validRecommendation)) });
  assert.deepEqual(decision, validRecommendation);
});

test("OpenAI recovery service rejects invalid JSON and provider failures", async () => {
  await assert.rejects(
    recommendWithOpenAi(context, { apiKey: "test-key", fetchImpl: successFetch("not json") }),
    (error) => error instanceof LlmProviderError && /invalid structured/.test(error.message),
  );
  await assert.rejects(
    recommendWithOpenAi(context, { apiKey: "test-key", fetchImpl: async () => ({ ok: false, json: async () => ({}) }) }),
    (error) => error instanceof LlmProviderError,
  );
  await assert.rejects(
    recommendWithOpenAi(context, { apiKey: "", fetchImpl: successFetch("{}") }),
    (error) => error instanceof LlmConfigurationError,
  );
});

test("Gemini recovery service returns a valid structured recommendation", async () => {
  const decision = await recommendWithGemini(context, {
    apiKey: "test-key",
    fetchImpl: geminiSuccessFetch(JSON.stringify(validGeminiRecommendation)),
  });

  assert.deepEqual(decision, validGeminiRecommendation);
});

test("Gemini recovery service rejects invalid structured output and provider failures", async () => {
  await assert.rejects(
    recommendWithGemini(context, { apiKey: "test-key", fetchImpl: geminiSuccessFetch("not json") }),
    (error) => error instanceof LlmProviderError && /invalid structured/.test(error.message),
  );
  await assert.rejects(
    recommendWithGemini(context, { apiKey: "test-key", fetchImpl: async () => ({ ok: false, json: async () => ({}) }) }),
    (error) => error instanceof LlmProviderError,
  );
  await assert.rejects(
    recommendWithGemini(context, { apiKey: "", fetchImpl: geminiSuccessFetch("{}") }),
    (error) => error instanceof LlmConfigurationError,
  );
});

test("the configured deterministic provider remains available without LLM credentials", async () => {
  const decision = await recommendRecoveryDecision(context, { provider: "deterministic" });
  assert.equal(decision.recommendedAction, "CREATE_PAYMENT_LINK");
  assert.equal(typeof decision.diagnosis, "string");
  assert.equal(typeof decision.reason, "string");
});
