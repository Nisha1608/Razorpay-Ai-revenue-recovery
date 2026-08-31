import { Router } from "express";

import { RazorpayApiError, RazorpayConfigurationError, createPaymentLink } from "../services/razorpayClient.js";

const testRazorpayRouter = Router();

export function isTestEndpointEnabled(environment = process.env.NODE_ENV) {
  return environment !== "production";
}

export function rupeesToPaise(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new TypeError("amount must be a positive INR amount in rupees.");
  }

  const paise = Math.round(amount * 100);
  if (!Number.isSafeInteger(paise) || Math.abs(amount * 100 - paise) > Number.EPSILON) {
    throw new TypeError("amount can include at most two decimal places.");
  }

  return paise;
}

export function createTestPaymentLinkInput({ amount, description } = {}) {
  if (typeof description !== "string" || !description.trim()) {
    throw new TypeError("description is required.");
  }

  return {
    amount: rupeesToPaise(amount),
    currency: "INR",
    description: description.trim(),
    referenceId: `recoverai_test_${Date.now()}`,
    notify: { sms: false, email: false },
    reminderEnable: false,
    notes: { source: "recoverai_phase_3_2_test" },
  };
}

testRazorpayRouter.post("/razorpay/payment-link", async (request, response, next) => {
  if (!isTestEndpointEnabled()) {
    return response.status(404).json({ error: { message: "Route not found." } });
  }

  try {
    const paymentLink = await createPaymentLink(createTestPaymentLinkInput(request.body));
    return response.status(201).json({ id: paymentLink.id, short_url: paymentLink.short_url });
  } catch (error) {
    if (error instanceof TypeError) {
      return response.status(400).json({ error: { message: error.message } });
    }

    if (error instanceof RazorpayConfigurationError) {
      return response.status(503).json({ error: { message: "Razorpay Test Mode is not configured." } });
    }

    if (error instanceof RazorpayApiError) {
      return response.status(error.statusCode || 502).json({ error: { message: "Razorpay could not create the test Payment Link." } });
    }

    next(error);
  }
});

export default testRazorpayRouter;

