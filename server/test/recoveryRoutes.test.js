import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import express from "express";

import recoveryRouter from "../src/routes/recoveryRoutes.js";

test("execute rejects an invalid recovery action ID with a client error", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/recovery", recoveryRouter);
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/recovery/actions/not-an-object-id/execute`, { method: "POST" });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error.message, /actionId must be a valid ID/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
