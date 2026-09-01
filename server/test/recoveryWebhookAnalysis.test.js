import assert from "node:assert/strict";
import test from "node:test";

import { processRazorpayEvent } from "../src/services/razorpayWebhook.js";

const payload = {
  payload: {
    payment: {
      entity: {
        id: "pay_analysis_once",
        amount: 125_000,
        currency: "INR",
        error_code: "BAD_REQUEST_ERROR",
        error_description: "Card declined",
        created_at: 1_788_160_000,
      },
    },
  },
};

test("a duplicate failed payment does not trigger duplicate recovery analysis", async () => {
  let existingPayment;
  let analysisCalls = 0;
  const models = {
    Payment: {
      findOne: async () => existingPayment,
      create: async (data) => { existingPayment = { ...data, _id: "payment_001" }; return existingPayment; },
    },
    Customer: {
      findOne: async () => null,
      create: async () => ({ _id: "customer_001" }),
      findByIdAndUpdate: async () => {},
    },
    RecoveryCase: { create: async () => ({ _id: "507f1f77bcf86cd799439011" }) },
    AuditLog: { create: async () => {} },
  };

  await processRazorpayEvent("payment.failed", payload, { ...models, analyzeRecovery: async () => { analysisCalls += 1; } });
  await processRazorpayEvent("payment.failed", payload, { ...models, analyzeRecovery: async () => { analysisCalls += 1; } });

  assert.equal(analysisCalls, 1);
});
