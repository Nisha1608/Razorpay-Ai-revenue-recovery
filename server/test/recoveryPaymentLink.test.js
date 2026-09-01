import assert from "node:assert/strict";
import test from "node:test";

import { createRecoveryPaymentLink } from "../src/services/razorpayClient.js";
import { createAndPersistRecoveryPaymentLink } from "../src/services/recoveryPaymentLink.js";

const recoveryCase = { _id: "507f1f77bcf86cd799439011" };
const payment = { amount: 1_250_000, currency: "INR" };
const customer = { name: "Aman Sharma", phone: "9000000001", email: "aman@example.com" };

test("recovery Payment Links deterministically associate the RecoveryCase", async () => {
  let request;
  const client = { paymentLink: { create: async (input) => {
    request = input;
    return { id: "plink_test_001", short_url: "https://rzp.io/i/test" };
  } } };

  const link = await createRecoveryPaymentLink({ recoveryCase, payment, customer }, client);

  assert.deepEqual(link, { id: "plink_test_001", short_url: "https://rzp.io/i/test", reference_id: "RECOVERY_507f1f77bcf86cd799439011" });
  assert.equal(request.amount, 1_250_000);
  assert.equal(request.currency, "INR");
  assert.equal(request.reference_id, "RECOVERY_507f1f77bcf86cd799439011");
  assert.equal(request.notes.recovery_case_id, recoveryCase._id);
  assert.deepEqual(request.notify, { sms: false, email: false });
  assert.equal(request.reminder_enable, false);
});

test("Payment Link creation persists its safe provider reference without replacing the idempotency key", async () => {
  let saves = 0;
  const recoveryAction = {
    type: "CREATE_PAYMENT_LINK",
    status: "approved",
    execution: { idempotencyKey: "preserve-this-key" },
    save: async () => { saves += 1; },
  };
  const client = { paymentLink: {
    all: async () => ({ payment_links: [] }),
    create: async () => ({ id: "plink_test_002", short_url: "https://rzp.io/i/second" }),
  } };

  await createAndPersistRecoveryPaymentLink({ recoveryCase, payment, customer, recoveryAction, client });

  assert.equal(saves, 2);
  assert.equal(recoveryAction.status, "executed");
  assert.equal(recoveryAction.execution.idempotencyKey, "preserve-this-key");
  assert.equal(recoveryAction.execution.providerReference, "plink_test_002");
  assert.equal(recoveryAction.execution.metadata.paymentLinkShortUrl, "https://rzp.io/i/second");
  assert.equal(recoveryAction.execution.metadata.referenceId, "RECOVERY_507f1f77bcf86cd799439011");
  assert.ok(recoveryAction.execution.executedAt instanceof Date);
});

test("an existing Recovery Payment Link is reconciled instead of creating a duplicate", async () => {
  let created = false;
  const recoveryAction = { type: "CREATE_PAYMENT_LINK", status: "approved", execution: {}, save: async () => {} };
  const client = { paymentLink: {
    all: async () => ({ payment_links: [{ id: "plink_existing", short_url: "https://rzp.io/i/existing", reference_id: "RECOVERY_507f1f77bcf86cd799439011" }] }),
    create: async () => { created = true; },
  } };

  const link = await createAndPersistRecoveryPaymentLink({ recoveryCase, payment, customer, recoveryAction, client });

  assert.equal(created, false);
  assert.equal(link.id, "plink_existing");
  assert.equal(recoveryAction.status, "executed");
  assert.equal(recoveryAction.execution.providerReference, "plink_existing");
});
