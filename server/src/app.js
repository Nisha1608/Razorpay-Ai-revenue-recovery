import cors from "cors";
import express from "express";

import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import testRazorpayRouter from "./routes/testRazorpayRoutes.js";
import webhookRouter from "./routes/webhookRoutes.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  }),
);
// Razorpay signs the exact request bytes, so this route must run before JSON parsing.
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRouter);
app.use(express.json());
app.use("/api/test", testRazorpayRouter);

app.get("/api/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "recover-ai-api",
    timestamp: new Date().toISOString(),
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
