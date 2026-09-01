import { createRecoveryPaymentLink, findRecoveryPaymentLink } from "./razorpayClient.js";

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

  const persistSuccess = async (paymentLink) => {
    recoveryAction.execution.providerReference = paymentLink.id;
    recoveryAction.execution.executedAt = new Date();
    recoveryAction.execution.metadata = {
      ...recoveryAction.execution.metadata,
      paymentLinkShortUrl: paymentLink.short_url,
      referenceId: paymentLink.reference_id,
    };
    recoveryAction.status = "executed";
    recoveryAction.markModified?.("execution");
    await recoveryAction.save();
    return paymentLink;
  };

  try {
    const existingPaymentLink = await findRecoveryPaymentLink(recoveryCase._id, client);
    if (existingPaymentLink) return persistSuccess(existingPaymentLink);

    return persistSuccess(await createRecoveryPaymentLink({ recoveryCase, payment, customer }, client));
  } catch (error) {
    try {
      // A create response can be lost after Razorpay has already created the link.
      const existingPaymentLink = await findRecoveryPaymentLink(recoveryCase._id, client);
      if (existingPaymentLink) return persistSuccess(existingPaymentLink);
    } catch {
      // Preserve the original create failure for the caller and audit trail.
    }

    recoveryAction.status = "failed";
    recoveryAction.execution.failureReason = error.message;
    recoveryAction.markModified?.("execution");
    await recoveryAction.save();
    throw error;
  }
}
