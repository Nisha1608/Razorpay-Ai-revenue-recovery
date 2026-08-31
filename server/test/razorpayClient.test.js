import assert from "node:assert/strict";
import test from "node:test";

import {
  RazorpayConfigurationError,
  createRazorpayClient,
  validatePaymentLinkInput,
  verifyRazorpayTestModeAuthentication,
} from "../src/services/razorpayClient.js";

const validPaymentLinkInput = {
  amount: 12_500,
  currency: "INR",
  referenceId: "recover_case_demo_001",
  customer: { name: "Aman Sharma", contact: "9000000001", email: "aman@example.com" },
};

test("Razorpay client requires server-side credentials", () => {
  assert.throws(() => createRazorpayClient({ keyId: "", keySecret: "" }), RazorpayConfigurationError);

  const client = createRazorpayClient({ keyId: "rzp_test_placeholder", keySecret: "placeholder_secret" });
  assert.equal(typeof client.paymentLink.create, "function");
});

test("Payment Link input is validated before an outbound request can be made", () => {
  assert.doesNotThrow(() => validatePaymentLinkInput(validPaymentLinkInput));
  assert.throws(() => validatePaymentLinkInput({ ...validPaymentLinkInput, amount: 1.5 }), TypeError);
  assert.throws(() => validatePaymentLinkInput({ ...validPaymentLinkInput, customer: { name: "Aman" } }), TypeError);
});

test("authentication verification refuses non-Test-Mode keys without an API request", async () => {
  await assert.rejects(
    verifyRazorpayTestModeAuthentication(undefined, "rzp_live_not_allowed"),
    RazorpayConfigurationError,
  );
});
