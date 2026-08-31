import assert from "node:assert/strict";
import test from "node:test";

import { normalizePaymentLinkPaid, processRazorpayEvent } from "../src/services/razorpayWebhook.js";

const caseId = "507f1f77bcf86cd799439011";
const paidPayload = {
  payload: {
    payment_link: {
      entity: {
        id: "plink_test_paid_001",
        reference_id: `RECOVERY_${caseId}`,
        notes: { recovery_case_id: caseId },
        amount: 1_250_000,
        amount_paid: 1_250_000,
        currency: "INR",
        status: "paid",
        created_at: 1_788_160_000,
      },
    },
  },
};

function createModels({ recovered = false } = {}) {
  const calls = { caseUpdate: 0, customerUpdates: [], auditLogs: [] };
  const models = {
    RecoveryCase: {
      findOneAndUpdate: async () => {
        calls.caseUpdate += 1;
        return recovered ? null : { _id: caseId, customer: "customer_001", payment: "payment_001" };
      },
    },
    Customer: { findByIdAndUpdate: async (...args) => calls.customerUpdates.push(args) },
    AuditLog: { create: async (entry) => calls.auditLogs.push(entry) },
  };
  return { models, calls };
}

test("payment_link.paid recovers an open case and records safe recovery side effects", async () => {
  const { models, calls } = createModels();
  const result = await processRazorpayEvent("payment_link.paid", paidPayload, models);

  assert.equal(result.recovered, true);
  assert.equal(calls.caseUpdate, 1);
  assert.deepEqual(calls.customerUpdates[0], ["customer_001", { $inc: { totalRecoveredAmount: 1_250_000 } }]);
  assert.equal(calls.auditLogs[0].eventType, "PAYMENT_LINK_PAID");
  assert.equal(calls.auditLogs[0].metadata.paymentLinkId, "plink_test_paid_001");
  assert.equal(calls.auditLogs[0].metadata.recoveredAmount, 1_250_000);
});

test("an already recovered case produces no duplicate payment-link recovery side effects", async () => {
  const { models, calls } = createModels({ recovered: true });
  const result = await processRazorpayEvent("payment_link.paid", paidPayload, models);

  assert.equal(result.recovered, false);
  assert.equal(calls.customerUpdates.length, 0);
  assert.equal(calls.auditLogs.length, 0);
});

test("missing recovery association is ignored and malformed Payment Link payloads are rejected", async () => {
  const { models, calls } = createModels();
  const unassociatedPayload = structuredClone(paidPayload);
  delete unassociatedPayload.payload.payment_link.entity.notes;
  delete unassociatedPayload.payload.payment_link.entity.reference_id;

  const result = await processRazorpayEvent("payment_link.paid", unassociatedPayload, models);
  assert.equal(result.ignored, true);
  assert.equal(calls.caseUpdate, 0);
  await assert.rejects(() => processRazorpayEvent("payment_link.paid", { payload: { payment_link: { entity: {} } } }, models));
  assert.throws(() => normalizePaymentLinkPaid({}), /valid paid Payment Link entity/);
});
