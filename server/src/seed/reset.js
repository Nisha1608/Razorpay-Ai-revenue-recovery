import {
  AuditLog,
  Customer,
  Payment,
  RecoveryAction,
  RecoveryCase,
  RecoveryEscalation,
  RecoveryNotification,
  WebhookEvent,
} from "../models/index.js";

export const recoverAiDataModels = [
  AuditLog,
  RecoveryNotification,
  RecoveryEscalation,
  RecoveryAction,
  RecoveryCase,
  Payment,
  Customer,
  WebhookEvent,
];

export async function resetRecoverAiData(models = recoverAiDataModels) {
  for (const model of models) {
    await model.deleteMany({});
  }
}
