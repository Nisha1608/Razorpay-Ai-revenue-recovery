import assert from "node:assert/strict";
import test from "node:test";

import { resetRecoverAiData } from "../src/seed/reset.js";

test("the RecoverAI seed reset removes only the supplied application models", async () => {
  const deleted = [];
  const models = ["AuditLog", "RecoveryNotification", "RecoveryEscalation", "RecoveryAction", "RecoveryCase", "Payment", "Customer", "WebhookEvent"]
    .map((name) => ({ deleteMany: async (filter) => deleted.push({ name, filter }) }));

  await resetRecoverAiData(models);

  assert.deepEqual(deleted.map(({ name }) => name), ["AuditLog", "RecoveryNotification", "RecoveryEscalation", "RecoveryAction", "RecoveryCase", "Payment", "Customer", "WebhookEvent"]);
  assert.ok(deleted.every(({ filter }) => Object.keys(filter).length === 0));
});
