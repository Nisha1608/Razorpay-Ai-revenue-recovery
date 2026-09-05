import assert from "node:assert/strict";
import test from "node:test";

import { approveRecoveryAction, executeRecoveryAction } from "../src/services/recoveryActionService.js";
import { analyzeAndRecommendRecovery } from "../src/services/recoveryAnalysis.js";
import { analyzeRecoveryCase } from "../src/services/recoveryDecisionEngine.js";
import { evaluateRecoveryPolicy } from "../src/services/recoveryPolicy.js";

const ids = { recoveryCase: "507f1f77bcf86cd799439011", payment: "507f1f77bcf86cd799439012", customer: "507f1f77bcf86cd799439013", action: "507f1f77bcf86cd799439014" };
const payment = { _id: ids.payment, amount: 125_000, currency: "INR", failureReason: "Card declined" };
const customer = { _id: ids.customer, successfulPayments: 8, failedPayments: 1, email: "aman@example.com", phone: "9000000001" };

test("decision engine selects deterministic recovery actions", () => {
  assert.equal(analyzeRecoveryCase({ recoveryCase: {}, payment: { ...payment, amount: 5_000_000 }, customer }).recommendedAction, "ESCALATE_TO_HUMAN");
  assert.equal(analyzeRecoveryCase({ recoveryCase: {}, payment, customer: { successfulPayments: 1, failedPayments: 3 } }).recommendedAction, "DO_NOTHING");
  assert.equal(analyzeRecoveryCase({ recoveryCase: {}, payment: { ...payment, failureReason: "Temporary network timeout" }, customer }).recommendedAction, "RETRY_PAYMENT");
  assert.equal(analyzeRecoveryCase({ recoveryCase: {}, payment, customer }).recommendedAction, "CREATE_PAYMENT_LINK");
});

test("policy allows fresh generic card failures while blocking unsafe retries", () => {
  assert.equal(evaluateRecoveryPolicy({ action: "UNKNOWN", payment, customer }).allowed, false);
  assert.equal(evaluateRecoveryPolicy({ action: "RETRY_PAYMENT", payment, customer }).allowed, false);
  assert.equal(evaluateRecoveryPolicy({ action: "RETRY_PAYMENT", payment: { ...payment, amount: 2_500, method: "card", failureReason: "Payment failed" }, customer, recoveryCase: { status: "open", previousAttempts: 0 } }).allowed, true);
  assert.equal(evaluateRecoveryPolicy({ action: "RETRY_PAYMENT", payment: { ...payment, failureReason: "Insufficient funds" }, customer, recoveryCase: { status: "open" } }).allowed, false);
  assert.equal(evaluateRecoveryPolicy({ action: "RETRY_PAYMENT", payment: { ...payment, method: "card", failureReason: "Payment failed" }, customer, recoveryCase: { status: "recovered" } }).allowed, false);
  assert.equal(evaluateRecoveryPolicy({ action: "RETRY_PAYMENT", payment: { ...payment, method: "card", failureReason: "Payment failed" }, customer, recoveryCase: { status: "open", previousAttempts: 1 } }).allowed, false);
  assert.equal(evaluateRecoveryPolicy({ action: "CREATE_PAYMENT_LINK", payment: { amount: 0 }, customer }).allowed, false);
  assert.equal(evaluateRecoveryPolicy({ action: "DO_NOTHING", payment, customer }).allowed, true);
});

function analysisModels() {
  const recoveryCase = { _id: ids.recoveryCase, payment: ids.payment, customer: ids.customer, status: "open", save: async () => {} };
  const calls = { actions: [], audits: [] };
  return {
    recoveryCase,
    calls,
    models: {
      RecoveryCase: { findById: async () => recoveryCase },
      Payment: { findById: async () => payment },
      Customer: { findById: async () => customer },
      RecoveryAction: {
        findOne: async () => null,
        create: async (action) => { const created = { ...action, _id: ids.action }; calls.actions.push(created); return created; },
      },
      AuditLog: { create: async (entries) => calls.audits.push(...entries) },
    },
  };
}

test("analysis creates a policy-evaluated action and marks the case action_pending", async () => {
  const { models, recoveryCase, calls } = analysisModels();
  const result = await analyzeAndRecommendRecovery(ids.recoveryCase, { models });

  assert.equal(result.action.type, "CREATE_PAYMENT_LINK");
  assert.equal(result.action.policyEvaluation.allowed, true);
  assert.equal(recoveryCase.status, "action_pending");
  assert.equal(recoveryCase.recommendedAction, "CREATE_PAYMENT_LINK");
  assert.equal(recoveryCase.activeAction, ids.action);
  assert.notEqual(recoveryCase.recommendedAction, result.action._id);
  assert.equal(recoveryCase.recoveryProbability, 0.86);
  assert.equal(recoveryCase.priority, "LOW");
  assert.equal(calls.audits[0].metadata.analysisSource, "DETERMINISTIC");
  assert.deepEqual(calls.audits.map((entry) => entry.eventType), ["AI_ANALYSIS", "POLICY_EVALUATED"]);
});

test("a fresh generic card failure can create a policy-approved retry action", async () => {
  const { models, recoveryCase } = analysisModels();
  models.Payment.findById = async () => ({ ...payment, amount: 2_500, method: "card", failureReason: "Payment failed" });
  const result = await analyzeAndRecommendRecovery(ids.recoveryCase, {
    models,
    provider: "gemini",
    decide: () => ({ riskScore: 30, recoveryProbability: 0.85, priority: "HIGH", recommendedAction: "RETRY_PAYMENT", diagnosis: "Generic card payment failure", reason: "A fresh generic card failure can be retried.", confidence: 0.85, rationale: "A fresh generic card failure can be retried." }),
  });

  assert.equal(result.action.policyEvaluation.allowed, true);
  assert.equal(result.action.status, "pending");
  assert.equal(recoveryCase.status, "action_pending");
});

test("invalid LLM probability and priority use the deterministic fallback", async () => {
  const { models, calls } = analysisModels();
  const result = await analyzeAndRecommendRecovery(ids.recoveryCase, {
    models,
    decide: () => ({ riskScore: 40, confidence: 0.8, recoveryProbability: 1.2, priority: "URGENT", recommendedAction: "CREATE_PAYMENT_LINK", rationale: "Invalid output" }),
  });

  assert.equal(result.action.type, "CREATE_PAYMENT_LINK");
  assert.equal(calls.actions.length, 1);
  assert.equal(calls.audits[0].eventType, "AI_ANALYSIS_FALLBACK");
});

test("invalid LLM action is replaced by a policy-reviewed deterministic fallback", async () => {
  const { models, recoveryCase, calls } = analysisModels();
  const result = await analyzeAndRecommendRecovery(ids.recoveryCase, {
    models,
    decide: () => ({ riskScore: 40, recoveryProbability: 0.8, priority: "LOW", recommendedAction: "NOT_ALLOWED", diagnosis: "Invalid", reason: "Invalid" }),
  });

  assert.equal(recoveryCase.status, "action_pending");
  assert.equal(result.action.type, "CREATE_PAYMENT_LINK");
  assert.equal(calls.actions.length, 1);
  assert.equal(calls.audits[0].eventType, "AI_ANALYSIS_FALLBACK");
});

test("invalid LLM fields are replaced by the deterministic fallback before persistence", async () => {
  const invalidDecisions = [
    { riskScore: 101, recoveryProbability: 0.8, priority: "LOW", recommendedAction: "CREATE_PAYMENT_LINK", diagnosis: "Valid", reason: "Valid" },
    { riskScore: 10, recoveryProbability: -0.1, priority: "LOW", recommendedAction: "CREATE_PAYMENT_LINK", diagnosis: "Valid", reason: "Valid" },
    { riskScore: 10, recoveryProbability: 0.8, priority: "URGENT", recommendedAction: "CREATE_PAYMENT_LINK", diagnosis: "Valid", reason: "Valid" },
    { riskScore: 10, recoveryProbability: 0.8, priority: "LOW", recommendedAction: "CREATE_PAYMENT_LINK", diagnosis: "", reason: "Valid" },
    { riskScore: 10, recoveryProbability: 0.8, priority: "LOW", recommendedAction: "CREATE_PAYMENT_LINK", diagnosis: "Valid", reason: "" },
  ];

  for (const decision of invalidDecisions) {
    const { models, calls } = analysisModels();
    const result = await analyzeAndRecommendRecovery(ids.recoveryCase, { models, decide: () => decision });
    assert.equal(result.action.type, "CREATE_PAYMENT_LINK");
    assert.equal(calls.actions.length, 1);
    assert.equal(calls.audits[0].eventType, "AI_ANALYSIS_FALLBACK");
  }
});

test("an unexpected decision error is audited and cannot create or execute an action", async () => {
  const { models, recoveryCase, calls } = analysisModels();
  const providerError = new Error("Unexpected decision failure.");

  await assert.rejects(analyzeAndRecommendRecovery(ids.recoveryCase, { models, decide: async () => { throw providerError; } }), (error) => error === providerError);

  assert.equal(recoveryCase.status, "open");
  assert.equal(calls.actions.length, 0);
  assert.equal(calls.audits[0].eventType, "AI_ANALYSIS_FAILED");
});

test("LLM failure uses a validated deterministic fallback before policy evaluation", async () => {
  const { models, recoveryCase, calls } = analysisModels();
  let fallbackCalls = 0;
  let policyCalls = 0;
  const fallbackDecision = { riskScore: 58, recoveryProbability: 0.74, priority: "MEDIUM", recommendedAction: "CREATE_PAYMENT_LINK", diagnosis: "Fallback diagnosis", reason: "Fallback reason", confidence: 0.74, rationale: "Fallback reason" };

  const result = await analyzeAndRecommendRecovery(ids.recoveryCase, {
    models,
    provider: "gemini",
    decide: async () => { throw Object.assign(new Error("LLM timed out"), { name: "LlmProviderError", statusCode: 504 }); },
    fallbackDecide: async () => { fallbackCalls += 1; return fallbackDecision; },
    evaluate: ({ action }) => { policyCalls += 1; return { allowed: action === "CREATE_PAYMENT_LINK", reason: "Payment Link is allowed." }; },
  });

  assert.equal(fallbackCalls, 1);
  assert.equal(policyCalls, 1);
  assert.equal(calls.actions.length, 1);
  assert.equal(result.action.type, "CREATE_PAYMENT_LINK");
  assert.equal(recoveryCase.recoveryProbability, 0.74);
  assert.equal(calls.audits[1].metadata.analysisSource, "DETERMINISTIC_FALLBACK");
  assert.deepEqual(calls.audits.map((entry) => entry.eventType), ["AI_ANALYSIS_FALLBACK", "AI_ANALYSIS", "POLICY_EVALUATED"]);
});

test("a successful OpenAI recommendation records its analysis source", async () => {
  const { models, calls } = analysisModels();
  await analyzeAndRecommendRecovery(ids.recoveryCase, {
    models,
    provider: "openai",
    decide: () => ({ riskScore: 62, recoveryProbability: 0.8, priority: "MEDIUM", recommendedAction: "CREATE_PAYMENT_LINK", diagnosis: "OpenAI diagnosis", reason: "OpenAI reason", confidence: 0.8, rationale: "OpenAI reason" }),
  });

  assert.equal(calls.audits[0].eventType, "AI_ANALYSIS");
  assert.equal(calls.audits[0].metadata.analysisSource, "OPENAI");
});

test("a successful Gemini recommendation records its analysis source", async () => {
  const { models, calls } = analysisModels();
  await analyzeAndRecommendRecovery(ids.recoveryCase, {
    models,
    provider: "gemini",
    decide: () => ({ riskScore: 62, recoveryProbability: 0.8, priority: "MEDIUM", recommendedAction: "CREATE_PAYMENT_LINK", diagnosis: "Gemini diagnosis", reason: "Gemini reason", confidence: 0.8, rationale: "Gemini reason" }),
  });

  assert.equal(calls.audits[0].eventType, "AI_ANALYSIS");
  assert.equal(calls.audits[0].metadata.analysisSource, "GEMINI");
});

test("a policy-blocked deterministic fallback remains non-executable", async () => {
  const { models, calls } = analysisModels();
  const fallbackDecision = { riskScore: 58, recoveryProbability: 0.74, priority: "MEDIUM", recommendedAction: "SEND_REMINDER", diagnosis: "Fallback diagnosis", reason: "Fallback reason", confidence: 0.74, rationale: "Fallback reason" };

  const result = await analyzeAndRecommendRecovery(ids.recoveryCase, {
    models,
    provider: "gemini",
    decide: async () => { throw Object.assign(new Error("LLM unavailable"), { name: "LlmProviderError", statusCode: 502 }); },
    fallbackDecide: async () => fallbackDecision,
    evaluate: () => ({ allowed: false, reason: "Policy blocked this action." }),
  });

  assert.equal(calls.actions.length, 1);
  assert.equal(result.action.policyEvaluation.allowed, false);
  assert.equal(result.action.status, "pending");
  assert.deepEqual(calls.audits.map((entry) => entry.eventType), ["AI_ANALYSIS_FALLBACK", "AI_ANALYSIS", "POLICY_EVALUATED"]);
});

test("policy remains authoritative over a valid AI recommendation", async () => {
  const { models, calls } = analysisModels();
  const result = await analyzeAndRecommendRecovery(ids.recoveryCase, {
    models,
    decide: () => ({ riskScore: 60, recoveryProbability: 0.7, priority: "MEDIUM", recommendedAction: "RETRY_PAYMENT", diagnosis: "Temporary issue", reason: "Try again", confidence: 0.7 }),
    evaluate: () => ({ allowed: false, reason: "Retries are not permitted for this payment." }),
  });

  assert.equal(result.action.type, "RETRY_PAYMENT");
  assert.equal(result.action.policyEvaluation.allowed, false);
  assert.equal(calls.actions.length, 1);
});

test("approval updates the action and activates it on the recovery case", async () => {
  const action = { _id: ids.action, recoveryCase: ids.recoveryCase, type: "CREATE_PAYMENT_LINK", status: "pending", policyEvaluation: { allowed: true }, save: async () => {} };
  const calls = { caseUpdate: null, audit: null };
  const models = {
    RecoveryAction: { findById: async () => action },
    RecoveryCase: { findByIdAndUpdate: async (...args) => { calls.caseUpdate = args; } },
    AuditLog: { create: async (entry) => { calls.audit = entry; } },
  };

  await approveRecoveryAction(ids.action, "operator@example.com", { models });

  assert.equal(action.status, "approved");
  assert.equal(action.approval.approvedBy, "operator@example.com");
  assert.equal(calls.caseUpdate[0], ids.recoveryCase);
  assert.equal(calls.audit.eventType, "ACTION_APPROVED");
});

test("policy-blocked actions cannot be approved", async () => {
  const action = { _id: ids.action, status: "pending", policyEvaluation: { allowed: false } };
  await assert.rejects(
    approveRecoveryAction(ids.action, "operator", { models: { RecoveryAction: { findById: async () => action } } }),
    /blocked by policy/,
  );
});

test("unapproved actions cannot be executed", async () => {
  const action = { _id: ids.action, status: "pending" };
  await assert.rejects(
    executeRecoveryAction(ids.action, { models: { RecoveryAction: { findById: async () => action } } }),
    (error) => error.statusCode === 409 && /Only approved recovery actions/.test(error.message),
  );
});

test("approved Payment Link action delegates to the existing recovery Payment Link service", async () => {
  const action = { _id: ids.action, recoveryCase: ids.recoveryCase, type: "CREATE_PAYMENT_LINK", status: "approved", save: async () => {} };
  const audits = [];
  let linkInput;
  const result = await executeRecoveryAction(ids.action, {
    models: {
      RecoveryAction: { findById: async () => action },
      RecoveryCase: { findById: async () => ({ _id: ids.recoveryCase, payment: ids.payment, customer: ids.customer }) },
      Payment: { findById: async () => payment },
      Customer: { findById: async () => customer },
      AuditLog: { create: async (entry) => audits.push(entry) },
    },
    createLink: async (input) => { linkInput = input; return { id: "plink_test_phase4", short_url: "https://rzp.io/i/phase4", reference_id: "RECOVERY_507f1f77bcf86cd799439011" }; },
  });

  assert.equal(linkInput.recoveryAction, action);
  assert.equal(result.paymentLink.id, "plink_test_phase4");
  assert.equal(audits[0].eventType, "ACTION_EXECUTED");
});

test("an approved retry creates a new linked Razorpay payment attempt without recovering the case", async () => {
  const action = { _id: ids.action, recoveryCase: ids.recoveryCase, type: "RETRY_PAYMENT", status: "approved", policyEvaluation: { allowed: true }, execution: {}, save: async () => {} };
  const recoveryCase = { _id: ids.recoveryCase, payment: ids.payment, customer: ids.customer, status: "action_pending", save: async () => {} };
  let linkCalls = 0;
  const result = await executeRecoveryAction(ids.action, {
    models: {
      RecoveryAction: { findById: async () => action },
      RecoveryCase: { findById: async () => recoveryCase },
      Payment: { findById: async () => payment },
      Customer: { findById: async () => customer },
      AuditLog: { create: async () => {} },
    },
    createLink: async ({ recoveryAction, payment: originalPayment }) => {
      linkCalls += 1;
      assert.equal(recoveryAction.type, "RETRY_PAYMENT");
      assert.equal(originalPayment._id, ids.payment);
      action.status = "executed";
      action.execution.providerReference = "plink_retry_001";
      return { id: "plink_retry_001", short_url: "https://rzp.io/i/retry", reference_id: `RETRY_${ids.recoveryCase}` };
    },
  });

  assert.equal(linkCalls, 1);
  assert.equal(result.paymentLink.reference_id, `RETRY_${ids.recoveryCase}`);
  assert.equal(recoveryCase.status, "action_pending");
  assert.notEqual(recoveryCase.status, "recovered");
});

test("approved development-safe actions persist execution without claiming recovery", async () => {
  for (const type of ["SEND_REMINDER", "OFFER_ALTERNATIVE_PAYMENT", "ESCALATE_TO_HUMAN", "DO_NOTHING"]) {
    const action = { _id: ids.action, recoveryCase: ids.recoveryCase, type, rationale: "Operator-approved recovery step.", status: "approved", policyEvaluation: { allowed: true }, save: async () => {} };
    const recoveryCase = { _id: ids.recoveryCase, payment: ids.payment, customer: ids.customer, status: "action_pending", save: async () => {} };
    const result = await executeRecoveryAction(ids.action, {
      models: {
        RecoveryAction: { findById: async () => action },
        RecoveryCase: { findById: async () => recoveryCase },
        Payment: { findById: async () => payment },
        Customer: { findById: async () => customer },
        RecoveryEscalation: { create: async (entry) => ({ _id: "escalation_001", ...entry, status: "open" }) },
        RecoveryNotification: { create: async (entry) => ({ _id: "notification_001", ...entry, status: "prepared" }) },
        AuditLog: { create: async () => {} },
      },
    });

    assert.equal(result.action.status, "executed");
    assert.notEqual(recoveryCase.status, "recovered");
    if (type === "DO_NOTHING") assert.equal(recoveryCase.status, "closed");
  }
});

test("policy-blocked and terminal-case actions cannot execute", async () => {
  const action = { _id: ids.action, recoveryCase: ids.recoveryCase, type: "RETRY_PAYMENT", status: "approved", policyEvaluation: { allowed: false } };
  await assert.rejects(executeRecoveryAction(ids.action, { models: { RecoveryAction: { findById: async () => action } } }), /blocked by policy/);

  action.policyEvaluation.allowed = true;
  await assert.rejects(
    executeRecoveryAction(ids.action, { models: { RecoveryAction: { findById: async () => action }, RecoveryCase: { findById: async () => ({ status: "recovered" }) } } }),
    /Closed recovery cases/,
  );
});

test("a stale interrupted Payment Link execution resumes through existing reconciliation", async () => {
  const action = {
    _id: ids.action,
    recoveryCase: ids.recoveryCase,
    type: "CREATE_PAYMENT_LINK",
    status: "executing",
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    execution: { idempotencyKey: "recovery-payment-link:test" },
    save: async () => {},
  };
  let linkCalls = 0;
  const result = await executeRecoveryAction(ids.action, {
    now: () => new Date("2026-09-01T00:01:00Z").getTime(),
    models: {
      RecoveryAction: { findById: async () => action },
      RecoveryCase: { findById: async () => ({ _id: ids.recoveryCase, payment: ids.payment, customer: ids.customer }) },
      Payment: { findById: async () => payment },
      Customer: { findById: async () => customer },
      AuditLog: { create: async () => {} },
    },
    createLink: async ({ recoveryAction }) => {
      linkCalls += 1;
      recoveryAction.status = "executed";
      recoveryAction.execution.providerReference = "plink_reconciled";
      recoveryAction.execution.executedAt = new Date();
      recoveryAction.execution.metadata = { paymentLinkShortUrl: "https://rzp.io/i/reconciled", referenceId: "RECOVERY_507f1f77bcf86cd799439011" };
      return { id: "plink_reconciled", short_url: "https://rzp.io/i/reconciled", reference_id: "RECOVERY_507f1f77bcf86cd799439011" };
    },
  });

  assert.equal(linkCalls, 1);
  assert.equal(result.action.status, "executed");
  assert.equal(result.action.execution.providerReference, "plink_reconciled");
});

test("approval and execution operate on the same persisted RecoveryAction", async () => {
  const action = {
    _id: ids.action,
    recoveryCase: ids.recoveryCase,
    type: "CREATE_PAYMENT_LINK",
    status: "pending",
    policyEvaluation: { allowed: true },
    save: async () => {},
  };
  const audits = [];
  let paymentLinksCreated = 0;
  const models = {
    RecoveryAction: { findById: async (actionId) => actionId === ids.action ? action : null },
    RecoveryCase: {
      findById: async () => ({ _id: ids.recoveryCase, payment: ids.payment, customer: ids.customer }),
      findByIdAndUpdate: async () => {},
    },
    Payment: { findById: async () => payment },
    Customer: { findById: async () => customer },
    AuditLog: { create: async (entry) => audits.push(entry) },
  };

  await approveRecoveryAction(ids.action, "operator@example.com", { models });
  assert.equal(action.status, "approved");

  await executeRecoveryAction(ids.action, {
    models,
    createLink: async ({ recoveryAction }) => {
      paymentLinksCreated += 1;
      recoveryAction.status = "executed";
      recoveryAction.execution = { providerReference: "plink_test_once", executedAt: new Date(), metadata: { paymentLinkShortUrl: "https://rzp.io/i/once", referenceId: "RECOVERY_507f1f77bcf86cd799439011" } };
      return { id: "plink_test_once", short_url: "https://rzp.io/i/once", reference_id: "RECOVERY_507f1f77bcf86cd799439011" };
    },
  });

  assert.equal(action.status, "executed");
  assert.equal(action.execution.providerReference, "plink_test_once");
  await assert.rejects(executeRecoveryAction(ids.action, { models }), /Only approved recovery actions/);
  assert.equal(paymentLinksCreated, 1);
  assert.ok(audits.some((entry) => entry.eventType === "ACTION_APPROVED"));
  assert.ok(audits.some((entry) => entry.eventType === "ACTION_EXECUTED"));
});

test("execution preserves a customer or Razorpay validation error and records an action failure", async () => {
  const action = { _id: ids.action, recoveryCase: ids.recoveryCase, type: "CREATE_PAYMENT_LINK", status: "approved", save: async () => {} };
  const audits = [];
  const models = {
    RecoveryAction: { findById: async () => action },
    RecoveryCase: { findById: async () => ({ _id: ids.recoveryCase, payment: ids.payment, customer: ids.customer }) },
    Payment: { findById: async () => payment },
    Customer: { findById: async () => customer },
    AuditLog: { create: async (entry) => audits.push(entry) },
  };
  const validationError = Object.assign(new Error("Recovery Payment Link requires the case customer's name, email, and phone."), {
    statusCode: 422,
    providerError: { httpStatus: 422, code: "BAD_REQUEST_ERROR", field: "customer.contact" },
  });

  await assert.rejects(
    executeRecoveryAction(ids.action, { models, createLink: async () => { throw validationError; } }),
    (error) => error === validationError,
  );
  assert.equal(audits[0].eventType, "ACTION_FAILED");
  assert.deepEqual(audits[0].metadata, { providerError: validationError.providerError });
});

test("a retryable Razorpay throttling failure is recorded in the action audit", async () => {
  const action = { _id: ids.action, recoveryCase: ids.recoveryCase, type: "RETRY_PAYMENT", status: "approved", save: async () => {} };
  const audits = [];
  const throttlingError = Object.assign(new Error("Razorpay is temporarily throttling requests. Please retry after the provider retry interval."), {
    statusCode: 503,
    retryable: true,
    providerError: { httpStatus: 429, code: "RATE_LIMIT_ERROR" },
  });

  await assert.rejects(
    executeRecoveryAction(ids.action, {
      models: {
        RecoveryAction: { findById: async () => action },
        RecoveryCase: { findById: async () => ({ _id: ids.recoveryCase, payment: ids.payment, customer: ids.customer }) },
        Payment: { findById: async () => payment },
        Customer: { findById: async () => customer },
        AuditLog: { create: async (entry) => audits.push(entry) },
      },
      createLink: async () => { throw throttlingError; },
    }),
    (error) => error === throttlingError,
  );

  assert.deepEqual(audits[0].metadata, { providerError: throttlingError.providerError, retryable: true });
});
