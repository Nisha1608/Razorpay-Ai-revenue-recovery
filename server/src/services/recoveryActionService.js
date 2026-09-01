import { AuditLog, Customer, Payment, RecoveryAction, RecoveryCase } from "../models/index.js";
import { createAndPersistRecoveryPaymentLink } from "./recoveryPaymentLink.js";

function createError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
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
  const models = { AuditLog, Customer, Payment, RecoveryAction, RecoveryCase, ...dependencies.models };
  const createLink = dependencies.createLink || createAndPersistRecoveryPaymentLink;
  const action = await models.RecoveryAction.findById(actionId);
  if (!action) throw createError("Recovery action not found.", 404);
  if (action.status !== "approved") throw createError("Only approved recovery actions can be executed.", 409);

  const audit = async (eventType, message, metadata) => models.AuditLog.create({
    recoveryCase: action.recoveryCase,
    action: action._id,
    actor: "system",
    eventType,
    message,
    metadata,
  });

  if (action.type === "DO_NOTHING") {
    action.status = "skipped";
    action.execution ??= {};
    action.execution.executedAt = new Date();
    await action.save();
    await audit("ACTION_EXECUTED", "No recovery action was taken by design.");
    return { action };
  }

  if (action.type === "ESCALATE_TO_HUMAN") {
    action.status = "executed";
    action.execution ??= {};
    action.execution.executedAt = new Date();
    action.execution.metadata = { ...action.execution.metadata, escalation: "human_review_required" };
    await action.save();
    await audit("ACTION_EXECUTED", "Recovery case was escalated to human review.");
    return { action };
  }

  if (action.type === "CREATE_PAYMENT_LINK") {
    const recoveryCase = await models.RecoveryCase.findById(action.recoveryCase);
    const [payment, customer] = await Promise.all([
      models.Payment.findById(recoveryCase?.payment),
      models.Customer.findById(recoveryCase?.customer),
    ]);
    if (!recoveryCase || !payment || !customer) throw createError("Recovery action is missing case context.", 409);

    try {
      const paymentLink = await createLink({ recoveryCase, payment, customer, recoveryAction: action });
      await audit("ACTION_EXECUTED", "Recovery Payment Link was created.", { paymentLinkId: paymentLink.id, referenceId: paymentLink.reference_id });
      return { action, paymentLink };

    } catch (error) {
      await audit("ACTION_FAILED", "Recovery Payment Link creation failed.");
      throw error;
    }
  }

  action.execution ??= {};
  action.execution.metadata = { ...action.execution.metadata, unsupported: true };
  action.status = "pending";
  await action.save();
  await audit("ACTION_FAILED", `${action.type} has no execution provider configured.`);
  return { action, unsupported: true };
}
