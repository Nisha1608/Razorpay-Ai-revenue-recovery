import mongoose from "mongoose";

const recoveryNotificationSchema = new mongoose.Schema(
  {
    recoveryCase: { type: mongoose.Schema.Types.ObjectId, ref: "RecoveryCase", required: true, index: true },
    action: { type: mongoose.Schema.Types.ObjectId, ref: "RecoveryAction", required: true, unique: true },
    channel: { type: String, required: true, enum: ["email", "sms", "manual_follow_up"] },
    status: { type: String, required: true, enum: ["prepared", "queued"], default: "prepared" },
  },
  { timestamps: true },
);

export const RecoveryNotification = mongoose.models.RecoveryNotification || mongoose.model("RecoveryNotification", recoveryNotificationSchema);
