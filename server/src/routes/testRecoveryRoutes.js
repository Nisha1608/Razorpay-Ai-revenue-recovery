import { Router } from "express";

import { Customer, Payment, RecoveryAction, RecoveryCase } from "../models/index.js";
import { createAndPersistRecoveryPaymentLink } from "../services/recoveryPaymentLink.js";

const testRecoveryRouter = Router();

export function isRecoveryTestEndpointEnabled(environment = process.env.NODE_ENV) {
  return environment !== "production";
}

function isValidRecoveryCaseId(value) {
  return /^[a-f\d]{24}$/i.test(value || "");
}

export function createTestRecoveryRouter({
  models = { Customer, Payment, RecoveryAction, RecoveryCase },
  createLink = createAndPersistRecoveryPaymentLink,
  environment = () => process.env.NODE_ENV,
} = {}) {
  const router = Router();

  router.post("/recovery/:recoveryCaseId/payment-link", async (request, response, next) => {
    if (!isRecoveryTestEndpointEnabled(environment())) {
      return response.status(404).json({ error: { message: "Route not found." } });
    }

    if (!isValidRecoveryCaseId(request.params.recoveryCaseId)) {
      return response.status(400).json({ error: { message: "recoveryCaseId must be a valid ID." } });
    }

    try {
      const recoveryCase = await models.RecoveryCase.findById(request.params.recoveryCaseId);
      if (!recoveryCase) {
        return response.status(404).json({ error: { message: "Recovery case not found." } });
      }

      if (["recovered", "closed"].includes(recoveryCase.status)) {
        return response.status(409).json({ error: { message: "A closed recovery case cannot receive a Payment Link." } });
      }

      const [payment, customer] = await Promise.all([
        models.Payment.findById(recoveryCase.payment),
        models.Customer.findById(recoveryCase.customer),
      ]);
      if (!payment || !customer) {
        return response.status(409).json({ error: { message: "Recovery case is missing its payment or customer." } });
      }

      let recoveryAction = await models.RecoveryAction.findOne({
        recoveryCase: recoveryCase._id,
        type: "CREATE_PAYMENT_LINK",
      });
      if (!recoveryAction) {
        recoveryAction = await models.RecoveryAction.create({
          recoveryCase: recoveryCase._id,
          type: "CREATE_PAYMENT_LINK",
          status: "approved",
          source: "system",
          rationale: "Development-only Payment Link recovery test.",
        });
      }

      const paymentLink = await createLink({ recoveryCase, payment, customer, recoveryAction });
      return response.status(201).json(paymentLink);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

testRecoveryRouter.use(createTestRecoveryRouter());

export default testRecoveryRouter;

