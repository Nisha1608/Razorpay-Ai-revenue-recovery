import mongoose from "mongoose";

import { RECOVERY_CASE_STATUS } from "../constants/recovery.js";

const recoveryCaseSchema = new mongoose.Schema(
  {
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", index: true },
    status: { type: String, required: true, enum: RECOVERY_CASE_STATUS, default: "open", index: true },
    riskScore: { type: Number, min: 0, max: 100 },
    aiAnalysis: {
      summary: { type: String, maxlength: 2_000 },
      confidence: { type: Number, min: 0, max: 1 },
      analyzedAt: Date,
    },
    recommendedAction: { type: mongoose.Schema.Types.ObjectId, ref: "RecoveryAction" },
    activeAction: { type: mongoose.Schema.Types.ObjectId, ref: "RecoveryAction" },
    recoveredAmount: { type: Number, default: 0, min: 0 },
    recoveredAt: Date,
    closedAt: Date,
  },
  { timestamps: true },
);

recoveryCaseSchema.index({ status: 1, createdAt: -1 });
recoveryCaseSchema.index({ customer: 1, status: 1 });

export const RecoveryCase = mongoose.models.RecoveryCase || mongoose.model("RecoveryCase", recoveryCaseSchema);

