import mongoose from "mongoose";

import { PAYMENT_STATUS } from "../constants/recovery.js";

const paymentSchema = new mongoose.Schema(
  {
    razorpayPaymentId: { type: String, required: true, trim: true, unique: true },
    razorpayOrderId: { type: String, trim: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", index: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, uppercase: true, trim: true, default: "INR", minlength: 3, maxlength: 3 },
    status: { type: String, required: true, enum: PAYMENT_STATUS, index: true },
    method: { type: String, trim: true, maxlength: 40 },
    failureCode: { type: String, trim: true, maxlength: 100 },
    failureReason: { type: String, trim: true, maxlength: 500 },
    failedAt: Date,
    capturedAt: Date,
    rawEvent: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

paymentSchema.index({ status: 1, failedAt: -1 });

export const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);

