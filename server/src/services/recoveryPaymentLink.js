import { createRecoveryPaymentLink } from "./razorpayClient.js";

function toSafeLinkInfo(action) {
  return {
    id: action.execution.providerReference,
    short_url: action.execution.metadata?.paymentLinkShortUrl,
    reference_id: action.execution.metadata?.referenceId,
  };
}

export async function createAndPersistRecoveryPaymentLink({ recoveryCase, payment, customer, recoveryAction, client }) {
  if (recoveryAction?.type !== "CREATE_PAYMENT_LINK") {
    throw new TypeError("RecoveryAction must be CREATE_PAYMENT_LINK.");
  }

  if (recoveryAction.execution?.providerReference) {
    return toSafeLinkInfo(recoveryAction);
  }

  recoveryAction.execution ??= {};
  recoveryAction.execution.idempotencyKey ??= `recovery-payment-link:${recoveryCase._id}`;
  recoveryAction.status = "executing";
  await recoveryAction.save();

  try {
    const paymentLink = await createRecoveryPaymentLink({ recoveryCase, payment, customer }, client);

    recoveryAction.execution.providerReference = paymentLink.id;
    recoveryAction.execution.executedAt = new Date();
    recoveryAction.execution.metadata = {
      ...recoveryAction.execution.metadata,
      paymentLinkShortUrl: paymentLink.short_url,
      referenceId: paymentLink.reference_id,
    };
    recoveryAction.status = "executed";
    await recoveryAction.save();

    return paymentLink;
  } catch (error) {
    recoveryAction.status = "failed";
    recoveryAction.execution.failureReason = error.message;
    await recoveryAction.save();
    throw error;
  }
}
