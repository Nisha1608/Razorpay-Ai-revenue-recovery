import mongoose from "mongoose";

const webhookEventSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true, trim: true, index: true },
    status: { type: String, required: true, enum: ["processing", "processed", "failed"], default: "processing" },
    attempts: { type: Number, default: 1, min: 1 },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    processedAt: Date,
    error: { type: String, maxlength: 1_000 },
  },
  { timestamps: true },
);

export const WebhookEvent = mongoose.models.WebhookEvent || mongoose.model("WebhookEvent", webhookEventSchema);

