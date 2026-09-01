const HIGH_VALUE_AMOUNT = 5_000_000; // Rs 50,000 in paise.
const RETRYABLE_FAILURE = /timeout|network|temporary|processing|gateway unavailable|service unavailable/i;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function isRetryableFailure(payment) {
  return RETRYABLE_FAILURE.test(`${payment?.failureCode || ""} ${payment?.failureReason || ""}`);
}

export function analyzeRecoveryCase({ recoveryCase, payment, customer }) {
  if (!recoveryCase || !payment || !customer) {
    throw new TypeError("Recovery case, payment, and customer are required for analysis.");
  }

  const successfulPayments = customer.successfulPayments || 0;
  const failedPayments = customer.failedPayments || 0;
  const totalHistory = successfulPayments + failedPayments;
  const successRate = totalHistory ? successfulPayments / totalHistory : 0.5;
  const highValue = payment.amount >= HIGH_VALUE_AMOUNT;
  const retryable = isRetryableFailure(payment);
  const riskScore = Math.round(clamp(
    50 + (failedPayments - successfulPayments) * 7 + (highValue ? 20 : 0) + (retryable ? 4 : 0),
    0,
    100,
  ));

  if (highValue) {
    return { riskScore, confidence: 0.95, recommendedAction: "ESCALATE_TO_HUMAN", rationale: "The failed payment is Rs 50,000 or more and requires human review." };
  }

  if (successfulPayments <= 1 && failedPayments >= 3) {
    return { riskScore, confidence: 0.88, recommendedAction: "DO_NOTHING", rationale: "The customer has weak payment history with repeated failures." };
  }

  if (retryable) {
    return { riskScore, confidence: 0.8, recommendedAction: "RETRY_PAYMENT", rationale: "The failure appears to be a temporary network, timeout, or processing issue." };
  }

  if (successfulPayments > failedPayments) {
    return { riskScore, confidence: Number(clamp(0.55 + successRate * 0.35, 0.55, 0.9).toFixed(2)), recommendedAction: "CREATE_PAYMENT_LINK", rationale: "The customer has a stronger successful payment history than failure history." };
  }

  return { riskScore, confidence: 0.6, recommendedAction: "SEND_REMINDER", rationale: "A reminder is the least intrusive next step for this payment history." };
}

