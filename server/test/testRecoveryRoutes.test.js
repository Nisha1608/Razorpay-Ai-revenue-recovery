import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import express from "express";

import { createTestRecoveryRouter, isRecoveryTestEndpointEnabled } from "../src/routes/testRecoveryRoutes.js";

const recoveryCaseId = "507f1f77bcf86cd799439011";

async function request(router, path) {
  const app = express();
  app.use(express.json());
  app.use("/api/test", router);
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST" });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function createModels({ recoveryCase } = {}) {
  const calls = { actionCreated: 0 };
  return {
    models: {
      RecoveryCase: { findById: async () => recoveryCase ?? { _id: recoveryCaseId, payment: "payment_001", customer: "customer_001", status: "open" } },
      Payment: { findById: async () => ({ _id: "payment_001", amount: 1_250_000, currency: "INR" }) },
      Customer: { findById: async () => ({ _id: "customer_001", name: "Aman", phone: "9000000001", email: "aman@example.com" }) },
      RecoveryAction: {
        findOne: async () => null,
        create: async (action) => { calls.actionCreated += 1; return { ...action, execution: {}, save: async () => {} }; },
      },
    },
    calls,
  };
}

test("development recovery route loads case data and delegates Payment Link creation", async () => {
  const { models, calls } = createModels();
  let serviceInput;
  const router = createTestRecoveryRouter({
    models,
    createLink: async (input) => {
      serviceInput = input;
      return { id: "plink_test_003", short_url: "https://rzp.io/i/recovery", reference_id: `RECOVERY_${recoveryCaseId}` };
    },
    environment: () => "development",
  });

  const result = await request(router, `/api/test/recovery/${recoveryCaseId}/payment-link`);

  assert.equal(result.status, 201);
  assert.deepEqual(result.body, { id: "plink_test_003", short_url: "https://rzp.io/i/recovery", reference_id: `RECOVERY_${recoveryCaseId}` });
  assert.equal(calls.actionCreated, 1);
  assert.equal(serviceInput.recoveryCase._id, recoveryCaseId);
  assert.equal(serviceInput.payment.amount, 1_250_000);
  assert.equal(serviceInput.customer.email, "aman@example.com");
});

test("development recovery route is disabled in production and rejects closed cases", async () => {
  const productionRouter = createTestRecoveryRouter({ environment: () => "production" });
  const productionResult = await request(productionRouter, `/api/test/recovery/${recoveryCaseId}/payment-link`);
  assert.equal(productionResult.status, 404);

  const { models } = createModels({ recoveryCase: { _id: recoveryCaseId, payment: "payment_001", customer: "customer_001", status: "recovered" } });
  const closedRouter = createTestRecoveryRouter({ models, environment: () => "development" });
  const closedResult = await request(closedRouter, `/api/test/recovery/${recoveryCaseId}/payment-link`);
  assert.equal(closedResult.status, 409);
  assert.equal(isRecoveryTestEndpointEnabled("production"), false);
});
