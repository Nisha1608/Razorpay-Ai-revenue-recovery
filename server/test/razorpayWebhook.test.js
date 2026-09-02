import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { createWebhookEventKey, normalizeRazorpayPayment, verifyRazorpaySignature } from "../src/services/razorpayWebhook.js";

const payload = {
  event: "payment.failed",
  payload: {
    payment: {
      entity: {
        id: "pay_webhook_001",
        order_id: "order_webhook_001",
        amount: 1_250_000,
        currency: "inr",
        method: "card",
        error_code: "BAD_REQUEST_ERROR",
        error_description: "Card declined by bank",
        email: "aman@example.com",
        contact: "9000000001",
        created_at: 1_788_160_000,
      },
    },
  },
};

test("Razorpay signatures are verified against the unmodified request body", () => {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const secret = "webhook_test_secret";
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  assert.equal(verifyRazorpaySignature(rawBody, signature, secret), true);
  assert.equal(verifyRazorpaySignature(rawBody, "bad-signature", secret), false);
  assert.equal(verifyRazorpaySignature(Buffer.from("{}"), signature, secret), false);
});

test("failed-payment events normalize into the internal payment format", () => {
  const normalized = normalizeRazorpayPayment("payment.failed", payload);

  assert.deepEqual(normalized.customer, {
    razorpayCustomerId: undefined,
    name: undefined,
    email: "aman@example.com",
    phone: "9000000001",
  });
  assert.equal(normalized.payment.status, "failed");
  assert.equal(normalized.payment.currency, "inr");
  assert.equal(normalized.payment.failureReason, "Card declined by bank");
});

test("webhook normalization preserves a Payment Page customer name and ignores Razorpay's placeholder email", () => {
  const normalized = normalizeRazorpayPayment("payment.failed", {
    ...payload,
    payload: {
      payment: {
        entity: {
          ...payload.payload.payment.entity,
          notes: { name: "Rahul Sharma" },
          email: "void@razorpay.com",
          contact: "9876543210",
        },
      },
    },
  });

  assert.equal(normalized.customer.name, "Rahul Sharma");
  assert.equal(normalized.customer.email, undefined);
  assert.equal(normalized.customer.phone, "9876543210");
});

test("event IDs are preferred for idempotency, with a body hash as fallback", () => {
  const rawBody = Buffer.from(JSON.stringify(payload));

  assert.equal(createWebhookEventKey("evt_123", rawBody), "evt_123");
  assert.equal(createWebhookEventKey(undefined, rawBody), crypto.createHash("sha256").update(rawBody).digest("hex"));
});
