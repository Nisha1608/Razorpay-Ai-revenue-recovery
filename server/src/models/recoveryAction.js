import mongoose from "mongoose";

import { RECOVERY_ACTION_STATUS, RECOVERY_ACTION_TYPES } from "../constants/recovery.js";

const recoveryActionSchema = new mongoose.Schema(
  {
    recoveryCase: { type: mongoose.Schema.Types.ObjectId, ref: "RecoveryCase", required: true, index: true },
    type: { type: String, required: true, enum: RECOVERY_ACTION_TYPES, index: true },
    status: { type: String, required: true, enum: RECOVERY_ACTION_STATUS, default: "pending", index: true },
    source: { type: String, required: true, enum: ["ai", "human", "system"], default: "ai" },
    rationale: { type: String, required: true, maxlength: 2_000 },
    confidence: { type: Number, min: 0, max: 1 },
    policyEvaluation: {
      allowed: Boolean,
      reason: { type: String, maxlength: 1_000 },
      evaluatedAt: Date,
    },
    approval: {
      approvedBy: { type: String, trim: true, maxlength: 120 },
      approvedAt: Date,
      rejectionReason: { type: String, maxlength: 1_000 },
    },
    execution: {
      idempotencyKey: { type: String, trim: true, sparse: true, unique: true },
      providerReference: { type: String, trim: true },
      executedAt: Date,
      failureReason: { type: String, maxlength: 1_000 },
      metadata: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true },
);

recoveryActionSchema.index({ recoveryCase: 1, createdAt: -1 });

export const RecoveryAction = mongoose.models.RecoveryAction || mongoose.model("RecoveryAction", recoveryActionSchema);

