import assert from "node:assert/strict";
import test from "node:test";

import { AuditLog, Customer, Payment, RecoveryAction, RecoveryCase } from "../src/models/index.js";

test("a failed payment requires a provider payment id, amount, currency, and valid status", () => {
  const validPayment = new Payment({
    razorpayPaymentId: "pay_demo_001",
    amount: 12_500,
    currency: "inr",
    status: "failed",
  });

  assert.equal(validPayment.validateSync(), undefined);
  assert.equal(validPayment.currency, "INR");

  const invalidPayment = new Payment({ razorpayPaymentId: "pay_demo_002", amount: 0, status: "unknown" });
  const error = invalidPayment.validateSync();
  assert.ok(error.errors.amount);
  assert.ok(error.errors.status);
});

test("recovery cases and actions only accept the defined lifecycle states and analysis fields", () => {
  const recoveryCase = new RecoveryCase({ payment: "507f1f77bcf86cd799439011", status: "recovered", riskScore: 82, recoveryProbability: 0.87, priority: "HIGH", recommendedAction: "CREATE_PAYMENT_LINK" });
  const action = new RecoveryAction({
    recoveryCase: "507f1f77bcf86cd799439011",
    type: "CREATE_PAYMENT_LINK",
    rationale: "The original card was declined and a link offers another method.",
  });

  assert.equal(recoveryCase.validateSync(), undefined);
  assert.equal(action.validateSync(), undefined);
  assert.ok(new RecoveryAction({ recoveryCase: "507f1f77bcf86cd799439011", type: "INVALID", rationale: "x" }).validateSync().errors.type);
  const invalidCase = new RecoveryCase({ payment: "507f1f77bcf86cd799439012", recoveryProbability: 1.1, priority: "URGENT" });
  const validationError = invalidCase.validateSync();
  assert.ok(validationError.errors.recoveryProbability);
  assert.ok(validationError.errors.priority);
  assert.ok(new RecoveryCase({ payment: "507f1f77bcf86cd799439013", recommendedAction: "not-an-action" }).validateSync().errors.recommendedAction);
  assert.ok(new RecoveryCase({ payment: "507f1f77bcf86cd799439014", recommendedAction: "507f1f77bcf86cd799439015" }).validateSync().errors.recommendedAction);
});

test("audit logs require an accountable actor and event message", () => {
  const auditLog = new AuditLog({
    recoveryCase: "507f1f77bcf86cd799439011",
    actor: "policy",
    eventType: "ACTION_ALLOWED",
    message: "CREATE_PAYMENT_LINK passed the configured policy checks.",
  });

  assert.equal(auditLog.validateSync(), undefined);
  assert.ok(new AuditLog({ recoveryCase: "507f1f77bcf86cd799439011", actor: "unknown" }).validateSync().errors.actor);
});

test("customer counters default to zero", () => {
  const customer = new Customer({ email: "aman@example.com" });

  assert.equal(customer.validateSync(), undefined);
  assert.equal(customer.failedPayments, 0);
  assert.equal(customer.totalRecoveredAmount, 0);
});
