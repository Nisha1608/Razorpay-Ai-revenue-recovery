import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    razorpayCustomerId: { type: String, trim: true, unique: true, sparse: true },
    name: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 32 },
    totalPayments: { type: Number, default: 0, min: 0 },
    successfulPayments: { type: Number, default: 0, min: 0 },
    failedPayments: { type: Number, default: 0, min: 0 },
    totalRecoveredAmount: { type: Number, default: 0, min: 0 },
    lastPaymentAt: Date,
  },
  { timestamps: true },
);

customerSchema.index({ email: 1 });
customerSchema.index({ phone: 1 });

export const Customer = mongoose.models.Customer || mongoose.model("Customer", customerSchema);

