import Razorpay from "razorpay";

const SAFE_PROVIDER_ERROR_FIELDS = ["code", "description", "field", "reason", "source", "step"];

function safeProviderErrorText(value) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 500)
    : undefined;
}

export function sanitizeRazorpayProviderError(error) {
  const providerError = error?.error || error?.response?.data?.error || error?.response?.body?.error || {};
  const httpStatus = Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
    ? error.statusCode
    : undefined;
  const sanitized = Object.fromEntries(
    SAFE_PROVIDER_ERROR_FIELDS
      .map((field) => [field, safeProviderErrorText(providerError[field])])
      .filter(([, value]) => value !== undefined),
  );

  if (httpStatus !== undefined) sanitized.httpStatus = httpStatus;
  return Object.keys(sanitized).length ? sanitized : undefined;
}

export class RazorpayConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RazorpayConfigurationError";
  }
}

export class RazorpayApiError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "RazorpayApiError";
    this.statusCode = cause?.statusCode;
    this.providerError = sanitizeRazorpayProviderError(cause);
  }
}

export class RazorpayValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RazorpayValidationError";
    this.statusCode = 422;
  }
}

function requireCredentials({ keyId, keySecret }) {
  if (!keyId || !keySecret) {
    throw new RazorpayConfigurationError("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured on the server.");
  }
}

export function createRazorpayClient({
  keyId = process.env.RAZORPAY_KEY_ID,
  keySecret = process.env.RAZORPAY_KEY_SECRET,
} = {}) {
  requireCredentials({ keyId, keySecret });

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export function validatePaymentLinkInput({ amount, currency, customer, referenceId } = {}) {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new TypeError("Payment Link amount must be a positive integer in the smallest currency unit.");
  }

  if (!/^[A-Za-z]{3}$/.test(currency || "")) {
    throw new TypeError("Payment Link currency must be a three-letter ISO currency code.");
  }

  if (customer && (!customer.name || !customer.contact || !customer.email)) {
    throw new TypeError("When provided, Payment Link customer name, contact, and email are all required.");
  }

  if (!referenceId || referenceId.length > 40) {
    throw new TypeError("Payment Link referenceId is required and must be 40 characters or fewer.");
  }
}

export function createRecoveryReferenceId(recoveryCaseId, actionType = "CREATE_PAYMENT_LINK") {
  const caseId = recoveryCaseId?.toString();

  if (!/^[a-f\d]{24}$/i.test(caseId || "")) {
    throw new TypeError("A valid RecoveryCase ID is required to create a recovery Payment Link.");
  }

  return actionType === "RETRY_PAYMENT" ? `RETRY_${caseId}` : `RECOVERY_${caseId}`;
}

export async function createPaymentLink(input, client) {
  validatePaymentLinkInput(input);
  const razorpayClient = client || createRazorpayClient();

  const request = {
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    reference_id: input.referenceId,
    description: input.description,
    customer: input.customer,
    notify: input.notify ?? { sms: true, email: true },
    reminder_enable: input.reminderEnable ?? true,
    notes: input.notes,
    callback_url: input.callbackUrl,
    callback_method: input.callbackMethod,
  };

  try {
    return await razorpayClient.paymentLink.create(request);
  } catch (error) {
    throw new RazorpayApiError("Razorpay could not create the Payment Link.", error);
  }
}

export async function createRecoveryPaymentLink({ recoveryCase, payment, customer, actionType = "CREATE_PAYMENT_LINK" }, client) {
  const recoveryCaseId = recoveryCase?._id?.toString();
  const referenceId = createRecoveryReferenceId(recoveryCaseId, actionType);

  if (!customer?.name || !customer?.email || !customer?.phone) {
    throw new RazorpayValidationError("Recovery Payment Link requires the case customer's name, email, and phone.");
  }

  const paymentLinkCustomer = { name: customer.name, contact: customer.phone, email: customer.email };

  const paymentLink = await createPaymentLink(
    {
      amount: payment?.amount,
      currency: payment?.currency,
      customer: paymentLinkCustomer,
      referenceId,
      description: actionType === "RETRY_PAYMENT"
        ? `RecoverAI retry payment for case ${recoveryCaseId}`
        : `RecoverAI recovery payment for case ${recoveryCaseId}`,
      notify: { sms: false, email: false },
      reminderEnable: false,
      notes: { recovery_case_id: recoveryCaseId },
    },
    client,
  );

  return { id: paymentLink.id, short_url: paymentLink.short_url, reference_id: referenceId };
}

export async function findRecoveryPaymentLink(recoveryCaseId, client, actionType = "CREATE_PAYMENT_LINK") {
  const referenceId = createRecoveryReferenceId(recoveryCaseId, actionType);
  const razorpayClient = client || createRazorpayClient();

  try {
    const result = await razorpayClient.paymentLink.all({ count: 100 });
    const paymentLink = result.payment_links?.find((link) => link.reference_id === referenceId);

    return paymentLink
      ? { id: paymentLink.id, short_url: paymentLink.short_url, reference_id: referenceId }
      : null;
  } catch (error) {
    throw new RazorpayApiError("Razorpay could not look up the recovery Payment Link.", error);
  }
}

export async function verifyRazorpayTestModeAuthentication(client, keyId = process.env.RAZORPAY_KEY_ID) {
  if (!keyId?.startsWith("rzp_test_")) {
    throw new RazorpayConfigurationError("Razorpay authentication verification only permits Test Mode keys (rzp_test_*).");
  }

  const razorpayClient = client || createRazorpayClient();

  try {
    // A one-item list request authenticates without creating a Razorpay resource.
    await razorpayClient.payments.all({ count: 1 });
    return { authenticated: true, mode: "test" };
  } catch (error) {
    throw new RazorpayApiError("Razorpay Test Mode authentication failed.", error);
  }
}
