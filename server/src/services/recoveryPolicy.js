import { RECOVERY_ACTION_TYPES } from "../constants/recovery.js";
import { isRetryableFailure } from "./recoveryDecisionEngine.js";

export function evaluateRecoveryPolicy({ action, payment, customer }) {
  if (!RECOVERY_ACTION_TYPES.includes(action)) {
    return { allowed: false, reason: "Unknown recovery action." };
  }

  if (action === "DO_NOTHING") return { allowed: true, reason: "No action is always permitted." };
  if (action === "ESCALATE_TO_HUMAN") return { allowed: true, reason: "Human escalation is permitted." };

  const validAmount = Number.isSafeInteger(payment?.amount) && payment.amount > 0;
  if (action === "CREATE_PAYMENT_LINK" || action === "OFFER_ALTERNATIVE_PAYMENT") {
    return validAmount
      ? { allowed: true, reason: "The payment has a valid positive amount." }
      : { allowed: false, reason: "The payment amount is invalid." };
  }

  if (action === "RETRY_PAYMENT") {
    return isRetryableFailure(payment)
      ? { allowed: true, reason: "The payment failure is retryable." }
      : { allowed: false, reason: "The payment failure is not retryable." };
  }

  if (action === "SEND_REMINDER") {
    return customer?.email || customer?.phone
      ? { allowed: true, reason: "Customer contact information is available." }
      : { allowed: false, reason: "A reminder requires customer contact information." };
  }

  return { allowed: false, reason: "The action is not permitted." };
}

