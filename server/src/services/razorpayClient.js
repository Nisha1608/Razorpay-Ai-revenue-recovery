import Razorpay from "razorpay";

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
