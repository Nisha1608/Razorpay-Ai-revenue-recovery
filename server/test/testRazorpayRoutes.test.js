import assert from "node:assert/strict";
import test from "node:test";

import { createTestPaymentLinkInput, isTestEndpointEnabled, rupeesToPaise } from "../src/routes/testRazorpayRoutes.js";

test("the development route converts INR rupees to paise", () => {
  assert.equal(rupeesToPaise(100), 10_000);
  assert.equal(rupeesToPaise(12.5), 1_250);
  assert.throws(() => rupeesToPaise(12.345), TypeError);
  assert.throws(() => rupeesToPaise(0), TypeError);
});

test("the test Payment Link input never enables customer notifications", () => {
  const input = createTestPaymentLinkInput({ amount: 100, description: "RecoverAI webhook test" });

  assert.equal(input.amount, 10_000);
  assert.deepEqual(input.notify, { sms: false, email: false });
  assert.equal(input.reminderEnable, false);
  assert.throws(() => createTestPaymentLinkInput({ amount: 100 }), TypeError);
});

test("the test endpoint is disabled in production", () => {
  assert.equal(isTestEndpointEnabled("development"), true);
  assert.equal(isTestEndpointEnabled("production"), false);
});
