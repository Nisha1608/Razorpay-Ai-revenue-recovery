import { createRecoveryPaymentLink, findRecoveryPaymentLink } from "./razorpayClient.js";

function toSafeLinkInfo(action) {
  return {
    id: action.execution.providerReference,
    short_url: action.execution.metadata?.paymentLinkShortUrl,
    reference_id: action.execution.metadata?.referenceId,
  };
}

function isProviderThrottlingError(error) {
  return error?.statusCode === 429 || error?.providerError?.httpStatus === 429;
}

function createRetryableThrottlingError(error) {
  return Object.assign(
    new Error("Razorpay is temporarily throttling requests. Please retry after the provider retry interval."),
    {
      name: "RazorpayThrottlingError",
      statusCode: 503,
      retryable: true,
      providerError: error.providerError,
      cause: error,
    },
  );
}

export async function createAndPersistRecoveryPaymentLink({ recoveryCase, payment, customer, recoveryAction, client }) {
  if (!["CREATE_PAYMENT_LINK", "RETRY_PAYMENT"].includes(recoveryAction?.type)) {
    throw new TypeError("RecoveryAction must create a Razorpay Payment Link.");
  }

  if (recoveryAction.execution?.providerReference) {
    return toSafeLinkInfo(recoveryAction);
  }

  recoveryAction.execution ??= {};
  recoveryAction.execution.idempotencyKey ??= `recovery-payment-link:${recoveryAction.type}:${recoveryCase._id}`;
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
    const existingPaymentLink = await findRecoveryPaymentLink(recoveryCase._id, client, recoveryAction.type);
    if (existingPaymentLink) return persistSuccess(existingPaymentLink);

    return persistSuccess(await createRecoveryPaymentLink({ recoveryCase, payment, customer, actionType: recoveryAction.type }, client));
  } catch (error) {
    try {
      // A create response can be lost after Razorpay has already created the link.
      const existingPaymentLink = await findRecoveryPaymentLink(recoveryCase._id, client, recoveryAction.type);
      if (existingPaymentLink) return persistSuccess(existingPaymentLink);
    } catch {
      // Preserve the original create failure for the caller and audit trail.
    }

    const failure = isProviderThrottlingError(error) ? createRetryableThrottlingError(error) : error;
    recoveryAction.status = "failed";
    recoveryAction.execution.failureReason = failure.message;
    if (failure.providerError || failure.retryable) {
      recoveryAction.execution.metadata = {
        ...recoveryAction.execution.metadata,
        ...(failure.providerError ? { providerError: failure.providerError } : {}),
        ...(failure.retryable ? { retryable: true } : {}),
      };
    }
    recoveryAction.markModified?.("execution");
    await recoveryAction.save();
    throw failure;
  }
}
