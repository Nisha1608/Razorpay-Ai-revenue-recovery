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

test("a failed Payment Page webhook persists notes.name for its customer", async () => {
  let createdCustomer;
  const models = {
    Payment: { findOne: async () => null, create: async (data) => ({ ...data, _id: "payment_002" }) },
    Customer: {
      findOne: async () => null,
      create: async (data) => { createdCustomer = { ...data, _id: "customer_002" }; return createdCustomer; },
      findByIdAndUpdate: async () => {},
    },
    RecoveryCase: { create: async () => ({ _id: "507f1f77bcf86cd799439011" }) },
    AuditLog: { create: async () => {} },
  };
  const paymentPagePayload = {
    payload: {
      payment: {
        entity: {
          id: "pay_customer_name",
          amount: 125_000,
          currency: "INR",
          email: "aman.recovery@test.com",
          contact: "9876543210",
          notes: { name: "Aman Test", email: "aman.recovery@test.com", phone: "9876543210" },
        },
      },
    },
  };

  await processRazorpayEvent("payment.failed", paymentPagePayload, { ...models, analyzeRecovery: async () => {} });

  assert.equal(createdCustomer.name, "Aman Test");
  assert.equal(createdCustomer.email, "aman.recovery@test.com");
  assert.equal(createdCustomer.phone, "9876543210");
});

test("an existing customer receives a missing webhook name without overwriting known data", async () => {
  const existingCustomer = { _id: "customer_003", email: "aman.recovery@test.com", name: undefined, saveCalls: 0, save: async function save() { this.saveCalls += 1; } };
  let createdRecoveryCase;
  const models = {
    Payment: { findOne: async () => null, create: async (data) => ({ ...data, _id: "payment_003" }) },
    Customer: {
      findOne: async () => existingCustomer,
      create: async () => { throw new Error("Customer should be reused."); },
      findByIdAndUpdate: async () => {},
    },
    RecoveryCase: { create: async (data) => { createdRecoveryCase = { ...data, _id: "507f1f77bcf86cd799439011" }; return createdRecoveryCase; } },
    AuditLog: { create: async () => {} },
  };
  const payloadWithName = {
    payload: {
      payment: {
        entity: {
          id: "pay_customer_existing",
          amount: 125_000,
          currency: "INR",
          email: "aman.recovery@test.com",
          contact: "9876543210",
          notes: { name: "Aman Test" },
        },
      },
    },
  };

  const result = await processRazorpayEvent("payment.failed", payloadWithName, { ...models, analyzeRecovery: async () => {} });

  assert.equal(existingCustomer.name, "Aman Test");
  assert.equal(existingCustomer.saveCalls, 1);
  assert.equal(createdRecoveryCase.customer, existingCustomer._id);
  assert.equal(result.recoveryCase, createdRecoveryCase);
});
