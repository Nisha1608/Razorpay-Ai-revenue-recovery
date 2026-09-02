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

test("policy blocks invalid and unsafe actions", () => {
  assert.equal(evaluateRecoveryPolicy({ action: "UNKNOWN", payment, customer }).allowed, false);
  assert.equal(evaluateRecoveryPolicy({ action: "RETRY_PAYMENT", payment, customer }).allowed, false);
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
  assert.deepEqual(calls.audits.map((entry) => entry.eventType), ["AI_ANALYSIS", "POLICY_EVALUATED"]);
});

test("analysis rejects invalid recovery probability and priority before creating an action", async () => {
  const { models, calls } = analysisModels();
  await assert.rejects(
    analyzeAndRecommendRecovery(ids.recoveryCase, {
      models,
      decide: () => ({ riskScore: 40, confidence: 0.8, recoveryProbability: 1.2, priority: "URGENT", recommendedAction: "CREATE_PAYMENT_LINK", rationale: "Invalid output" }),
    }),
    /invalid recovery probability/,
  );
  assert.equal(calls.actions.length, 0);
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
  const validationError = Object.assign(new Error("Recovery Payment Link requires the case customer's name, email, and phone."), { statusCode: 422 });

  await assert.rejects(
    executeRecoveryAction(ids.action, { models, createLink: async () => { throw validationError; } }),
    (error) => error === validationError,
  );
  assert.equal(audits[0].eventType, "ACTION_FAILED");
});
