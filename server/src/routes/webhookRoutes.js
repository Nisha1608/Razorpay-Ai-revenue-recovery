import { Router } from "express";

import { WebhookEvent } from "../models/index.js";
import { createWebhookEventKey, processRazorpayEvent, verifyRazorpaySignature } from "../services/razorpayWebhook.js";

const webhookRouter = Router();

webhookRouter.post("/razorpay", async (request, response, next) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = request.get("x-razorpay-signature");

    if (!secret) {
      return response.status(503).json({ error: { message: "Webhook endpoint is not configured." } });
    }

    if (!verifyRazorpaySignature(request.body, signature, secret)) {
      return response.status(401).json({ error: { message: "Invalid webhook signature." } });
    }

    const eventType = request.get("x-razorpay-event") || JSON.parse(request.body.toString("utf8")).event;
    const payload = JSON.parse(request.body.toString("utf8"));
    const eventKey = createWebhookEventKey(request.get("x-razorpay-event-id"), request.body);
    let webhookEvent = await WebhookEvent.findOne({ eventKey });

    if (webhookEvent?.status === "processed") {
      return response.status(200).json({ received: true, duplicate: true });
    }

    if (webhookEvent) {
      webhookEvent.set({ status: "processing", attempts: webhookEvent.attempts + 1, error: undefined });
      await webhookEvent.save();
    } else {
      webhookEvent = await WebhookEvent.create({ eventKey, eventType, payload });
    }

    const result = await processRazorpayEvent(eventType, payload);
    webhookEvent.set({ status: "processed", processedAt: new Date() });
    await webhookEvent.save();

    return response.status(200).json({ received: true, ignored: Boolean(result.ignored) });
  } catch (error) {
    if (error.name === "MongoServerError" && error.code === 11000) {
      return response.status(200).json({ received: true, duplicate: true });
    }

    if (error.name === "SyntaxError") {
      return response.status(400).json({ error: { message: "Webhook body must contain valid JSON." } });
    }

    next(error);
  }
});

export default webhookRouter;

