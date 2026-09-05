import { AuditLog, Customer, Payment, RecoveryAction, RecoveryCase, RecoveryEscalation, RecoveryNotification } from "../models/index.js";
import { createAndPersistRecoveryPaymentLink } from "./recoveryPaymentLink.js";

function createError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function isStalePaymentLinkExecution(action, now = Date.now()) {
  const updatedAt = new Date(action?.updatedAt).getTime();
  return ["CREATE_PAYMENT_LINK", "RETRY_PAYMENT"].includes(action?.type)
    && action.status === "executing"
    && !action.execution?.providerReference
    && Number.isFinite(updatedAt)
    && now - updatedAt >= 30_000;
}

export async function approveRecoveryAction(actionId, approvedBy, dependencies = {}) {
  const models = { AuditLog, RecoveryAction, RecoveryCase, ...dependencies.models };
  const action = await models.RecoveryAction.findById(actionId);
  if (!action) throw createError("Recovery action not found.", 404);
  if (!action.policyEvaluation?.allowed) throw createError("This recovery action is blocked by policy.", 403);
  if (action.status !== "pending") throw createError("Only pending recovery actions can be approved.", 409);

  action.status = "approved";
  action.approval = { approvedBy, approvedAt: new Date() };
  await action.save();
  await models.RecoveryCase.findByIdAndUpdate(action.recoveryCase, { $set: { activeAction: action._id } });
  await models.AuditLog.create({
    recoveryCase: action.recoveryCase,
    action: action._id,
    actor: "user",
    eventType: "ACTION_APPROVED",
    message: `${action.type} was approved by ${approvedBy}.`,
  });

  return action;
}

export async function executeRecoveryAction(actionId, dependencies = {}) {
  const models = { AuditLog, Customer, Payment, RecoveryAction, RecoveryCase, RecoveryEscalation, RecoveryNotification, ...dependencies.models };
  const createLink = dependencies.createLink || createAndPersistRecoveryPaymentLink;
  const action = await models.RecoveryAction.findById(actionId);
  if (!action) throw createError("Recovery action not found.", 404);
  if (action.policyEvaluation?.allowed === false) throw createError("This recovery action is blocked by policy.", 403);
  if (action.status !== "approved" && !isStalePaymentLinkExecution(action, dependencies.now?.() ?? Date.now())) {
    throw createError("Only approved recovery actions can be executed.", 409);
  }

  const recoveryCase = await models.RecoveryCase.findById(action.recoveryCase);
  if (!recoveryCase) throw createError("Recovery action is missing case context.", 409);
  if (["recovered", "closed", "superseded"].includes(recoveryCase.status)) {
    throw createError("Closed recovery cases cannot execute recovery actions.", 409);
  }

  const audit = async (eventType, message, metadata) => models.AuditLog.create({
    recoveryCase: action.recoveryCase,
    action: action._id,
    actor: "system",
    eventType,
    message,
    metadata,
  });

  const markExecuted = async (metadata = {}) => {
    action.status = "executed";
    action.execution ??= {};
    action.execution.executedAt = new Date();
    action.execution.metadata = { ...action.execution.metadata, ...metadata };
    action.markModified?.("execution");
    await action.save();
  };

  if (action.type === "DO_NOTHING") {
    await markExecuted({ outcome: "no_action_taken" });
    recoveryCase.status = "closed";
    recoveryCase.closedAt = new Date();
    recoveryCase.journeyStatus = "closed";
    await recoveryCase.save?.();
    await audit("ACTION_EXECUTED", "No recovery action was taken by design.");
    return { action };
  }

  if (action.type === "ESCALATE_TO_HUMAN") {
    const escalation = await models.RecoveryEscalation.create({
      recoveryCase: recoveryCase._id,
      action: action._id,
      reason: action.rationale,
    });
    await markExecuted({ escalationId: escalation._id, escalationStatus: escalation.status });
    await audit("ACTION_EXECUTED", "Recovery case was escalated to human review.");
    return { action, escalation };
  }

  if (["CREATE_PAYMENT_LINK", "RETRY_PAYMENT"].includes(action.type)) {
    const [payment, customer] = await Promise.all([
      models.Payment.findById(recoveryCase.payment),
      models.Customer.findById(recoveryCase.customer),
    ]);
    if (!payment || !customer) throw createError("Recovery action is missing case context.", 409);

    try {
      const paymentLink = await createLink({ recoveryCase, payment, customer, recoveryAction: action });
      const message = action.type === "RETRY_PAYMENT"
        ? "A new Razorpay payment attempt was created for this recovery case."
        : "Recovery Payment Link was created.";
      await audit("ACTION_EXECUTED", message, { paymentLinkId: paymentLink.id, referenceId: paymentLink.reference_id });
      return { action, paymentLink };

    } catch (error) {
      const failureMetadata = {
        ...(error.providerError ? { providerError: error.providerError } : {}),
        ...(error.retryable ? { retryable: true } : {}),
      };
      await audit("ACTION_FAILED", "Recovery Payment Link creation failed.", Object.keys(failureMetadata).length ? failureMetadata : undefined);
      throw error;
    }
  }

  if (action.type === "SEND_REMINDER") {
    const customer = await models.Customer.findById(recoveryCase.customer);
    const notification = await models.RecoveryNotification.create({
      recoveryCase: recoveryCase._id,
      action: action._id,
      channel: customerChannel(customer),
    });
    await markExecuted({ reminder: { status: notification.status, channel: notification.channel } });
    await audit("ACTION_EXECUTED", "Recovery reminder was prepared for development delivery.");
    return { action };
  }

  if (action.type === "OFFER_ALTERNATIVE_PAYMENT") {
    await markExecuted({ alternativePayment: { status: "offered", options: ["UPI", "card", "netbanking"] } });
    await audit("ACTION_EXECUTED", "Alternative payment options were prepared for the customer.");
    return { action };
  }

  action.execution ??= {};
  action.execution.metadata = { ...action.execution.metadata, unsupported: true };
  action.status = "pending";
  await action.save();
  await audit("ACTION_FAILED", `${action.type} has no execution provider configured.`);
  return { action, unsupported: true };
}

function customerChannel(customer) {
  if (customer?.email) return "email";
  if (customer?.phone) return "sms";
  return "manual_follow_up";
}
