export const PAYMENT_STATUS = ["created", "authorized", "captured", "failed", "refunded"];

export const RECOVERY_CASE_STATUS = [
  "open",
  "analyzing",
  "action_pending",
  "executing",
  "recovered",
  "closed",
];

export const RECOVERY_ACTION_TYPES = [
  "RETRY_PAYMENT",
  "CREATE_PAYMENT_LINK",
  "SEND_REMINDER",
  "OFFER_ALTERNATIVE_PAYMENT",
  "ESCALATE_TO_HUMAN",
  "DO_NOTHING",
];

export const RECOVERY_ACTION_STATUS = [
  "pending",
  "approved",
  "rejected",
  "executing",
  "executed",
  "failed",
  "skipped",
];

export const AUDIT_ACTORS = ["system", "ai", "policy", "user", "razorpay"];

