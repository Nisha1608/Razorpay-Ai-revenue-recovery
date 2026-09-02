import mongoose from "mongoose";

const recoveryEscalationSchema = new mongoose.Schema(
  {
    recoveryCase: { type: mongoose.Schema.Types.ObjectId, ref: "RecoveryCase", required: true, index: true },
    action: { type: mongoose.Schema.Types.ObjectId, ref: "RecoveryAction", required: true, unique: true },
    reason: { type: String, required: true, trim: true, maxlength: 2_000 },
    status: { type: String, required: true, enum: ["open", "resolved"], default: "open", index: true },
  },
  { timestamps: true },
);

export const RecoveryEscalation = mongoose.models.RecoveryEscalation || mongoose.model("RecoveryEscalation", recoveryEscalationSchema);
