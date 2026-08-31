import crypto from "node:crypto";

import { AuditLog, Customer, Payment, RecoveryCase } from "../models/index.js";

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function isRecoveryCaseId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

export function resolveRecoveryCaseId({ notes, referenceId } = {}) {
  const notedCaseId = firstDefined(notes?.recovery_case_id, notes?.recoveryCaseId);
  if (isRecoveryCaseId(notedCaseId)) return notedCaseId;

  const match = /^RECOVERY_([a-f\d]{24})$/i.exec(referenceId || "");
  return match?.[1];
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
    recoveryCaseId: resolveRecoveryCaseId({ notes: entity.notes }),
  };
}

export function normalizePaymentLinkPaid(payload) {
  const entity = payload?.payload?.payment_link?.entity;
  const recoveredAmount = entity?.amount_paid;

  if (!entity?.id || !Number.isSafeInteger(recoveredAmount) || recoveredAmount < 1 || !entity.currency) {
    throw new Error("Webhook payload does not contain a valid paid Payment Link entity.");
  }

  const timestamp = firstDefined(entity.paid_at, entity.updated_at, entity.created_at);
  return {
    paymentLinkId: entity.id,
    referenceId: entity.reference_id,
    recoveryCaseId: resolveRecoveryCaseId({ notes: entity.notes, referenceId: entity.reference_id }),
    recoveredAmount,
    currency: entity.currency,
    paidAt: timestamp ? new Date(timestamp * 1_000) : new Date(),
  };
}

async function findOrCreateCustomer(customerDetails, models) {
  const filters = [];

  if (customerDetails.razorpayCustomerId) filters.push({ razorpayCustomerId: customerDetails.razorpayCustomerId });
  if (customerDetails.email) filters.push({ email: customerDetails.email.toLowerCase() });
  if (customerDetails.phone) filters.push({ phone: customerDetails.phone });

  const customer = filters.length ? await models.Customer.findOne({ $or: filters }) : null;
  if (customer) {
    return customer;
  }

  return models.Customer.create(customerDetails);
}

async function recordFailedPayment(normalized, models) {
  const existingPayment = await models.Payment.findOne({ razorpayPaymentId: normalized.payment.razorpayPaymentId });
  if (existingPayment) return { duplicatePayment: true, payment: existingPayment };

  const customer = await findOrCreateCustomer(normalized.customer, models);
  const payment = await models.Payment.create({ ...normalized.payment, customer: customer._id });
  await models.Customer.findByIdAndUpdate(customer._id, {
    $inc: { totalPayments: 1, failedPayments: 1 },
    $set: { lastPaymentAt: payment.failedAt },
  });

  const recoveryCase = await models.RecoveryCase.create({ payment: payment._id, customer: customer._id });
  await models.AuditLog.create({
    recoveryCase: recoveryCase._id,
    payment: payment._id,
    actor: "razorpay",
    eventType: "PAYMENT_FAILED",
    message: "Razorpay reported a failed payment and RecoverAI opened a recovery case.",
    metadata: { razorpayPaymentId: payment.razorpayPaymentId, failureCode: payment.failureCode },
  });

  return { duplicatePayment: false, payment, recoveryCase };
}

async function recordCapturedPayment(normalized, models) {
  let payment = await models.Payment.findOne({ razorpayPaymentId: normalized.payment.razorpayPaymentId });

  if (!payment) {
    const customer = await findOrCreateCustomer(normalized.customer, models);
    payment = await models.Payment.create({ ...normalized.payment, customer: customer._id });
    await models.Customer.findByIdAndUpdate(customer._id, {
      $inc: { totalPayments: 1, successfulPayments: 1 },
      $set: { lastPaymentAt: payment.capturedAt },
    });
  } else {
    payment.set(normalized.payment);
    await payment.save();
  }

  if (!normalized.recoveryCaseId) return { payment, recovered: false };

  const recoveryCase = await models.RecoveryCase.findOneAndUpdate(
    { _id: normalized.recoveryCaseId, status: { $nin: ["recovered", "closed"] } },
    { $set: { status: "recovered", recoveredAmount: payment.amount, recoveredAt: payment.capturedAt, closedAt: payment.capturedAt } },
    { new: true },
  );

  if (!recoveryCase) return { payment, recovered: false };

  await models.Customer.findByIdAndUpdate(recoveryCase.customer, { $inc: { totalRecoveredAmount: payment.amount } });
  await models.AuditLog.create({
    recoveryCase: recoveryCase._id,
    payment: payment._id,
    actor: "razorpay",
    eventType: "PAYMENT_RECOVERED",
    message: "Razorpay confirmed the recovery payment was captured.",
    after: { recoveredAmount: payment.amount, status: "recovered" },
  });

  return { payment, recoveryCase, recovered: true };
}

async function recordPaymentLinkPaid(normalized, models) {
  if (!normalized.recoveryCaseId) return { ignored: true, recovered: false };

  const recoveryCase = await models.RecoveryCase.findOneAndUpdate(
    { _id: normalized.recoveryCaseId, status: { $nin: ["recovered", "closed"] } },
    {
      $set: {
        status: "recovered",
        recoveredAmount: normalized.recoveredAmount,
        recoveredAt: normalized.paidAt,
        closedAt: normalized.paidAt,
      },
    },
    { new: true },
  );

  if (!recoveryCase) return { ignored: true, recovered: false };

  await models.Customer.findByIdAndUpdate(recoveryCase.customer, { $inc: { totalRecoveredAmount: normalized.recoveredAmount } });
  await models.AuditLog.create({
    recoveryCase: recoveryCase._id,
    payment: recoveryCase.payment,
    actor: "razorpay",
    eventType: "PAYMENT_LINK_PAID",
    message: "Razorpay confirmed the Recovery Payment Link was paid.",
    metadata: {
      paymentLinkId: normalized.paymentLinkId,
      referenceId: normalized.referenceId,
      recoveredAmount: normalized.recoveredAmount,
    },
  });

  return { recoveryCase, recovered: true };
}

export async function processRazorpayEvent(eventType, payload, dependencies = {}) {
  const models = { AuditLog, Customer, Payment, RecoveryCase, ...dependencies };

  if (eventType !== "payment.failed" && eventType !== "payment.captured" && eventType !== "payment_link.paid") {
    return { ignored: true };
  }

  if (eventType === "payment_link.paid") {
    return recordPaymentLinkPaid(normalizePaymentLinkPaid(payload), models);
  }

  const normalized = normalizeRazorpayPayment(eventType, payload);
  return eventType === "payment.failed" ? recordFailedPayment(normalized, models) : recordCapturedPayment(normalized, models);
}
