import crypto from "node:crypto";

import { AuditLog, Customer, Payment, RecoveryCase } from "../models/index.js";

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function verifyRazorpaySignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || !signature || !secret) {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return provided.length === expectedBuffer.length && crypto.timingSafeEqual(provided, expectedBuffer);
}

export function createWebhookEventKey(eventId, rawBody) {
  return eventId || crypto.createHash("sha256").update(rawBody).digest("hex");
}

export function normalizeRazorpayPayment(eventType, payload) {
  const entity = payload?.payload?.payment?.entity;

  if (!entity?.id || !entity.amount || !entity.currency) {
    throw new Error("Webhook payload does not contain a valid payment entity.");
  }

  const status = eventType === "payment.failed" ? "failed" : "captured";
  const occurredAt = entity.created_at ? new Date(entity.created_at * 1_000) : new Date();

  return {
    payment: {
      razorpayPaymentId: entity.id,
      razorpayOrderId: entity.order_id || undefined,
      amount: entity.amount,
      currency: entity.currency,
      status,
      method: entity.method || undefined,
      failureCode: status === "failed" ? entity.error_code || undefined : undefined,
      failureReason: status === "failed" ? entity.error_description || undefined : undefined,
      failedAt: status === "failed" ? occurredAt : undefined,
      capturedAt: status === "captured" ? occurredAt : undefined,
      rawEvent: payload,
    },
    customer: {
      razorpayCustomerId: entity.customer_id || undefined,
      name: entity.notes?.customer_name || undefined,
      email: entity.email || undefined,
      phone: entity.contact || undefined,
    },
    recoveryCaseId: firstDefined(entity.notes?.recovery_case_id, entity.notes?.recoveryCaseId),
  };
}

async function findOrCreateCustomer(customerDetails) {
  const filters = [];

  if (customerDetails.razorpayCustomerId) filters.push({ razorpayCustomerId: customerDetails.razorpayCustomerId });
  if (customerDetails.email) filters.push({ email: customerDetails.email.toLowerCase() });
  if (customerDetails.phone) filters.push({ phone: customerDetails.phone });

  const customer = filters.length ? await Customer.findOne({ $or: filters }) : null;
  if (customer) {
    return customer;
  }

  return Customer.create(customerDetails);
}

async function recordFailedPayment(normalized) {
  const existingPayment = await Payment.findOne({ razorpayPaymentId: normalized.payment.razorpayPaymentId });
  if (existingPayment) return { duplicatePayment: true, payment: existingPayment };

  const customer = await findOrCreateCustomer(normalized.customer);
  const payment = await Payment.create({ ...normalized.payment, customer: customer._id });
  await Customer.findByIdAndUpdate(customer._id, {
    $inc: { totalPayments: 1, failedPayments: 1 },
    $set: { lastPaymentAt: payment.failedAt },
  });

  const recoveryCase = await RecoveryCase.create({ payment: payment._id, customer: customer._id });
  await AuditLog.create({
    recoveryCase: recoveryCase._id,
    payment: payment._id,
    actor: "razorpay",
    eventType: "PAYMENT_FAILED",
    message: "Razorpay reported a failed payment and RecoverAI opened a recovery case.",
    metadata: { razorpayPaymentId: payment.razorpayPaymentId, failureCode: payment.failureCode },
  });

  return { duplicatePayment: false, payment, recoveryCase };
}

async function recordCapturedPayment(normalized) {
  let payment = await Payment.findOne({ razorpayPaymentId: normalized.payment.razorpayPaymentId });

  if (!payment) {
    const customer = await findOrCreateCustomer(normalized.customer);
    payment = await Payment.create({ ...normalized.payment, customer: customer._id });
    await Customer.findByIdAndUpdate(customer._id, {
      $inc: { totalPayments: 1, successfulPayments: 1 },
      $set: { lastPaymentAt: payment.capturedAt },
    });
  } else {
    payment.set(normalized.payment);
    await payment.save();
  }

  if (!normalized.recoveryCaseId) return { payment, recovered: false };

  const recoveryCase = await RecoveryCase.findOneAndUpdate(
    { _id: normalized.recoveryCaseId, status: { $ne: "recovered" } },
    { $set: { status: "recovered", recoveredAmount: payment.amount, recoveredAt: payment.capturedAt, closedAt: payment.capturedAt } },
    { new: true },
  );

  if (!recoveryCase) return { payment, recovered: false };

  await Customer.findByIdAndUpdate(recoveryCase.customer, { $inc: { totalRecoveredAmount: payment.amount } });
  await AuditLog.create({
    recoveryCase: recoveryCase._id,
    payment: payment._id,
    actor: "razorpay",
    eventType: "PAYMENT_RECOVERED",
    message: "Razorpay confirmed the recovery payment was captured.",
    after: { recoveredAmount: payment.amount, status: "recovered" },
  });

  return { payment, recoveryCase, recovered: true };
}

export async function processRazorpayEvent(eventType, payload) {
  if (eventType !== "payment.failed" && eventType !== "payment.captured") {
    return { ignored: true };
  }

  const normalized = normalizeRazorpayPayment(eventType, payload);
  return eventType === "payment.failed" ? recordFailedPayment(normalized) : recordCapturedPayment(normalized);
}

