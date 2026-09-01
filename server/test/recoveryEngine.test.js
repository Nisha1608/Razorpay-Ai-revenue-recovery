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
  assert.equal(recoveryCase.recommendedAction, ids.action);
  assert.deepEqual(calls.audits.map((entry) => entry.eventType), ["AI_ANALYSIS", "POLICY_EVALUATED"]);
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
