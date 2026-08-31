import "dotenv/config";

import { verifyRazorpayTestModeAuthentication } from "../services/razorpayClient.js";

try {
  const result = await verifyRazorpayTestModeAuthentication();
  console.log(`Razorpay ${result.mode} mode authentication: PASS`);
} catch (error) {
  console.error(`Razorpay Test Mode authentication: FAIL (${error.message})`);
  process.exitCode = 1;
}

