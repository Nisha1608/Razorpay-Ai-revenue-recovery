import mongoose from "mongoose";

import { AUDIT_ACTORS } from "../constants/recovery.js";

const auditLogSchema = new mongoose.Schema(
  {
    recoveryCase: { type: mongoose.Schema.Types.ObjectId, ref: "RecoveryCase", required: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", index: true },
    action: { type: mongoose.Schema.Types.ObjectId, ref: "RecoveryAction", index: true },
    actor: { type: String, required: true, enum: AUDIT_ACTORS },
    eventType: { type: String, required: true, trim: true, maxlength: 100, index: true },
    message: { type: String, required: true, trim: true, maxlength: 2_000 },
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

auditLogSchema.index({ recoveryCase: 1, createdAt: 1 });

export const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

