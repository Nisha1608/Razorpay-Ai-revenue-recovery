import "dotenv/config";
import mongoose from "mongoose";


import { connectDatabase } from "../config/database.js";
import {
  AuditLog,
  Customer,
  Payment,
  RecoveryAction,
  RecoveryCase,
} from "../models/index.js";

async function seedDatabase() {
  try {
    await connectDatabase();

    console.log("Clearing existing demo data...");

    // Development/demo only.
    // This removes existing documents from these collections.
    await AuditLog.deleteMany({});
    await RecoveryAction.deleteMany({});
    await RecoveryCase.deleteMany({});
    await Payment.deleteMany({});
    await Customer.deleteMany({});

    console.log("Existing demo data cleared.");

    // ============================================================
    // CUSTOMERS
    // ============================================================

    const customers = await Customer.insertMany([
      {
        name: "Aman Sharma",
        email: "aman@example.com",
        phone: "9000000001",
        totalPayments: 15,
        successfulPayments: 14,
        failedPayments: 1,
        totalRecoveredAmount: 0,
        lastPaymentAt: new Date("2026-08-25"),
      },

      {
        name: "Rahul Verma",
        email: "rahul@example.com",
        phone: "9000000002",
        totalPayments: 8,
        successfulPayments: 2,
        failedPayments: 6,
        totalRecoveredAmount: 0,
        lastPaymentAt: new Date("2026-08-20"),
      },

      {
        name: "Priya Singh",
        email: "priya@example.com",
        phone: "9000000003",
        totalPayments: 12,
        successfulPayments: 10,
        failedPayments: 2,
        totalRecoveredAmount: 0,
        lastPaymentAt: new Date("2026-08-27"),
      },

      {
        name: "Vikas Gupta",
        email: "vikas@example.com",
        phone: "9000000004",
        totalPayments: 6,
        successfulPayments: 5,
        failedPayments: 1,
        totalRecoveredAmount: 0,
        lastPaymentAt: new Date("2026-08-22"),
      },

      {
        name: "Neha Jain",
        email: "neha@example.com",
        phone: "9000000005",
        totalPayments: 20,
        successfulPayments: 19,
        failedPayments: 1,
        totalRecoveredAmount: 0,
        lastPaymentAt: new Date("2026-08-28"),
      },

      {
        name: "Rohit Mehta",
        email: "rohit@example.com",
        phone: "9000000006",
        totalPayments: 10,
        successfulPayments: 7,
        failedPayments: 3,
        totalRecoveredAmount: 0,
        lastPaymentAt: new Date("2026-08-18"),
      },

      {
        name: "Sneha Kapoor",
        email: "sneha@example.com",
        phone: "9000000007",
        totalPayments: 18,
        successfulPayments: 16,
        failedPayments: 2,
        totalRecoveredAmount: 0,
        lastPaymentAt: new Date("2026-08-26"),
      },

      {
        name: "Arjun Malhotra",
        email: "arjun@example.com",
        phone: "9000000008",
        totalPayments: 5,
        successfulPayments: 1,
        failedPayments: 4,
        totalRecoveredAmount: 0,
        lastPaymentAt: new Date("2026-08-15"),
      },

      {
        name: "Kavya Rao",
        email: "kavya@example.com",
        phone: "9000000009",
        totalPayments: 9,
        successfulPayments: 8,
        failedPayments: 1,
        totalRecoveredAmount: 0,
        lastPaymentAt: new Date("2026-08-24"),
      },

      {
        name: "Saurabh Agarwal",
        email: "saurabh@example.com",
        phone: "9000000010",
        totalPayments: 7,
        successfulPayments: 6,
        failedPayments: 1,
        totalRecoveredAmount: 0,
        lastPaymentAt: new Date("2026-08-21"),
      },
    ]);

    console.log(`Created ${customers.length} customers.`);

    const [
      aman,
      rahul,
      priya,
      vikas,
      neha,
      rohit,
      sneha,
      arjun,
      kavya,
      saurabh,
    ] = customers;

    // ============================================================
    // PAYMENTS
    //
    // IMPORTANT:
    // Razorpay amounts are stored in the smallest currency unit.
    // Therefore:
    // ₹12,500 = 1,250,000 paise
    // ₹75,000 = 7,500,000 paise
    // ============================================================

    const payments = await Payment.insertMany([
      // Aman - successful history
      {
        razorpayPaymentId: "pay_demo_aman_001",
        customer: aman._id,
        amount: 500000,
        currency: "INR",
        status: "captured",
        method: "card",
        capturedAt: new Date("2026-07-01"),
      },

      {
        razorpayPaymentId: "pay_demo_aman_002",
        customer: aman._id,
        amount: 750000,
        currency: "INR",
        status: "captured",
        method: "upi",
        capturedAt: new Date("2026-07-15"),
      },

      {
        razorpayPaymentId: "pay_demo_aman_003",
        customer: aman._id,
        amount: 1250000,
        currency: "INR",
        status: "failed",
        method: "card",
        failureCode: "BAD_REQUEST_ERROR",
        failureReason: "Card declined by bank",
        failedAt: new Date("2026-08-30"),
      },

      // Rahul - poor payment history
      {
        razorpayPaymentId: "pay_demo_rahul_001",
        customer: rahul._id,
        amount: 800000,
        currency: "INR",
        status: "failed",
        method: "card",
        failureCode: "BAD_REQUEST_ERROR",
        failureReason: "Multiple card declines",
        failedAt: new Date("2026-08-29"),
      },

      {
        razorpayPaymentId: "pay_demo_rahul_002",
        customer: rahul._id,
        amount: 450000,
        currency: "INR",
        status: "captured",
        method: "upi",
        capturedAt: new Date("2026-08-20"),
      },

      // Priya
      {
        razorpayPaymentId: "pay_demo_priya_001",
        customer: priya._id,
        amount: 1200000,
        currency: "INR",
        status: "failed",
        method: "card",
        failureCode: "BAD_REQUEST_ERROR",
        failureReason: "Temporary bank decline",
        failedAt: new Date("2026-08-29"),
      },

      // Vikas - high-value case
      {
        razorpayPaymentId: "pay_demo_vikas_001",
        customer: vikas._id,
        amount: 7500000,
        currency: "INR",
        status: "failed",
        method: "netbanking",
        failureCode: "BAD_REQUEST_ERROR",
        failureReason: "Bank transaction failed",
        failedAt: new Date("2026-08-30"),
      },

      // Neha
      {
        razorpayPaymentId: "pay_demo_neha_001",
        customer: neha._id,
        amount: 120000,
        currency: "INR",
        status: "failed",
        method: "upi",
        failureCode: "BAD_REQUEST_ERROR",
        failureReason: "UPI transaction timeout",
        failedAt: new Date("2026-08-30"),
      },

      // Rohit
      {
        razorpayPaymentId: "pay_demo_rohit_001",
        customer: rohit._id,
        amount: 300000,
        currency: "INR",
        status: "failed",
        method: "card",
        failureCode: "BAD_REQUEST_ERROR",
        failureReason: "Insufficient funds",
        failedAt: new Date("2026-08-28"),
      },

      // Sneha
      {
        razorpayPaymentId: "pay_demo_sneha_001",
        customer: sneha._id,
        amount: 250000,
        currency: "INR",
        status: "failed",
        method: "card",
        failureCode: "BAD_REQUEST_ERROR",
        failureReason: "Temporary card decline",
        failedAt: new Date("2026-08-29"),
      },

      // Arjun - low probability
      {
        razorpayPaymentId: "pay_demo_arjun_001",
        customer: arjun._id,
        amount: 600000,
        currency: "INR",
        status: "failed",
        method: "card",
        failureCode: "BAD_REQUEST_ERROR",
        failureReason: "Repeated payment failures",
        failedAt: new Date("2026-08-27"),
      },

      // Kavya
      {
        razorpayPaymentId: "pay_demo_kavya_001",
        customer: kavya._id,
        amount: 950000,
        currency: "INR",
        status: "failed",
        method: "upi",
        failureCode: "BAD_REQUEST_ERROR",
        failureReason: "UPI timeout",
        failedAt: new Date("2026-08-30"),
      },

      // Saurabh
      {
        razorpayPaymentId: "pay_demo_saurabh_001",
        customer: saurabh._id,
        amount: 180000,
        currency: "INR",
        status: "failed",
        method: "card",
        failureCode: "BAD_REQUEST_ERROR",
        failureReason: "Card expired",
        failedAt: new Date("2026-08-29"),
      },
    ]);

    console.log(`Created ${payments.length} payments.`);

    // Find important demo payments
    const amanFailedPayment = payments.find(
      (payment) => payment.razorpayPaymentId === "pay_demo_aman_003",
    );

    const rahulFailedPayment = payments.find(
      (payment) => payment.razorpayPaymentId === "pay_demo_rahul_001",
    );

    const priyaFailedPayment = payments.find(
      (payment) => payment.razorpayPaymentId === "pay_demo_priya_001",
    );

    const vikasFailedPayment = payments.find(
      (payment) => payment.razorpayPaymentId === "pay_demo_vikas_001",
    );

    const nehaFailedPayment = payments.find(
      (payment) => payment.razorpayPaymentId === "pay_demo_neha_001",
    );

    const arjunFailedPayment = payments.find(
      (payment) => payment.razorpayPaymentId === "pay_demo_arjun_001",
    );

    // ============================================================
    // RECOVERY CASES
    // ============================================================

    const recoveryCases = await RecoveryCase.insertMany([
      // Aman - HIGH probability recovery
      {
        payment: amanFailedPayment._id,
        customer: aman._id,
        status: "recovered",
        riskScore: 91,
        aiAnalysis: {
          summary:
            "Customer has strong payment history with 14 successful payments out of 15. Failure appears temporary. Payment Link is recommended.",
          confidence: 0.91,
          analyzedAt: new Date("2026-08-30T10:01:00Z"),
        },
        recoveredAmount: 1250000,
        recoveredAt: new Date("2026-08-30T10:15:00Z"),
        closedAt: new Date("2026-08-30T10:15:00Z"),
      },

      // Rahul - low probability
      {
        payment: rahulFailedPayment._id,
        customer: rahul._id,
        status: "open",
        riskScore: 32,
        aiAnalysis: {
          summary:
            "Customer has a high historical failure rate. Automatic recovery has low expected value.",
          confidence: 0.82,
          analyzedAt: new Date("2026-08-30T10:05:00Z"),
        },
      },

      // Priya - active recovery
      {
        payment: priyaFailedPayment._id,
        customer: priya._id,
        status: "action_pending",
        riskScore: 78,
        aiAnalysis: {
          summary:
            "Customer has strong historical payment behavior. UPI/payment-link recovery is likely to succeed.",
          confidence: 0.88,
          analyzedAt: new Date("2026-08-30T10:10:00Z"),
        },
      },

      // Vikas - high-value escalation
      {
        payment: vikasFailedPayment._id,
        customer: vikas._id,
        status: "action_pending",
        riskScore: 94,
        aiAnalysis: {
          summary:
            "High-value payment requires human review before automated recovery.",
          confidence: 0.95,
          analyzedAt: new Date("2026-08-30T10:12:00Z"),
        },
      },

      // Neha - active
      {
        payment: nehaFailedPayment._id,
        customer: neha._id,
        status: "open",
        riskScore: 69,
        aiAnalysis: {
          summary:
            "UPI timeout appears temporary. Alternative payment path may recover the transaction.",
          confidence: 0.79,
          analyzedAt: new Date("2026-08-30T10:20:00Z"),
        },
      },

      // Arjun - low recovery probability
      {
        payment: arjunFailedPayment._id,
        customer: arjun._id,
        status: "open",
        riskScore: 25,
        aiAnalysis: {
          summary:
            "Customer has repeated payment failures and weak historical conversion. Avoid aggressive automated recovery.",
          confidence: 0.84,
          analyzedAt: new Date("2026-08-30T10:25:00Z"),
        },
      },
    ]);

    console.log(`Created ${recoveryCases.length} recovery cases.`);

    const amanCase = recoveryCases[0];
    const rahulCase = recoveryCases[1];
    const priyaCase = recoveryCases[2];
    const vikasCase = recoveryCases[3];
    const nehaCase = recoveryCases[4];
    const arjunCase = recoveryCases[5];

    // ============================================================
    // RECOVERY ACTIONS
    // ============================================================

    const recoveryActions = await RecoveryAction.insertMany([
      // Aman - successful Payment Link recovery
      {
        recoveryCase: amanCase._id,
        type: "CREATE_PAYMENT_LINK",
        status: "executed",
        source: "ai",
        rationale:
          "Strong payment history and high recovery probability make a Payment Link the preferred recovery action.",
        confidence: 0.91,
        policyEvaluation: {
          allowed: true,
          reason:
            "Customer is eligible and automatic recovery limit has not been reached.",
          evaluatedAt: new Date("2026-08-30T10:02:00Z"),
        },
        execution: {
          idempotencyKey: "demo-action-aman-payment-link",
          providerReference: "plink_demo_aman_001",
          executedAt: new Date("2026-08-30T10:03:00Z"),
        },
      },

      // Rahul - do nothing
      {
        recoveryCase: rahulCase._id,
        type: "DO_NOTHING",
        status: "approved",
        source: "ai",
        rationale:
          "Repeated failures indicate low recovery probability and automatic intervention may create unnecessary friction.",
        confidence: 0.82,
        policyEvaluation: {
          allowed: true,
          reason:
            "No automatic communication is required for this low-probability case.",
          evaluatedAt: new Date("2026-08-30T10:06:00Z"),
        },
      },

      // Priya - Payment Link pending
      {
        recoveryCase: priyaCase._id,
        type: "CREATE_PAYMENT_LINK",
        status: "approved",
        source: "ai",
        rationale:
          "Customer has a strong payment history and the failure appears temporary.",
        confidence: 0.88,
        policyEvaluation: {
          allowed: true,
          reason: "Recovery action is within configured policy limits.",
          evaluatedAt: new Date("2026-08-30T10:11:00Z"),
        },
        approval: {
          approvedBy: "policy-engine",
          approvedAt: new Date("2026-08-30T10:11:30Z"),
        },
      },

      // Vikas - human escalation
      {
        recoveryCase: vikasCase._id,
        type: "ESCALATE_TO_HUMAN",
        status: "approved",
        source: "ai",
        rationale:
          "The transaction amount is above the automatic recovery threshold and requires human review.",
        confidence: 0.95,
        policyEvaluation: {
          allowed: true,
          reason: "High-value transaction requires human escalation.",
          evaluatedAt: new Date("2026-08-30T10:13:00Z"),
        },
        approval: {
          approvedBy: "policy-engine",
          approvedAt: new Date("2026-08-30T10:13:10Z"),
        },
      },

      // Neha - blocked reminder example
      {
        recoveryCase: nehaCase._id,
        type: "SEND_REMINDER",
        status: "skipped",
        source: "ai",
        rationale:
          "AI recommended a reminder based on the temporary UPI failure.",
        confidence: 0.79,
        policyEvaluation: {
          allowed: false,
          reason:
            "Recovery message limit has already been reached for this customer.",
          evaluatedAt: new Date("2026-08-30T10:21:00Z"),
        },
      },

      // Arjun - no action
      {
        recoveryCase: arjunCase._id,
        type: "DO_NOTHING",
        status: "approved",
        source: "ai",
        rationale:
          "Repeated payment failures indicate low probability of successful automated recovery.",
        confidence: 0.84,
        policyEvaluation: {
          allowed: true,
          reason: "Avoid unnecessary automated customer contact.",
          evaluatedAt: new Date("2026-08-30T10:26:00Z"),
        },
      },
    ]);

    console.log(`Created ${recoveryActions.length} recovery actions.`);

    // ============================================================
    // UPDATE CASE REFERENCES
    // ============================================================

    const amanAction = recoveryActions[0];
    const rahulAction = recoveryActions[1];
    const priyaAction = recoveryActions[2];
    const vikasAction = recoveryActions[3];
    const nehaAction = recoveryActions[4];
    const arjunAction = recoveryActions[5];

    await RecoveryCase.findByIdAndUpdate(amanCase._id, {
      recommendedAction: amanAction._id,
      activeAction: amanAction._id,
    });

    await RecoveryCase.findByIdAndUpdate(rahulCase._id, {
      recommendedAction: rahulAction._id,
      activeAction: rahulAction._id,
    });

    await RecoveryCase.findByIdAndUpdate(priyaCase._id, {
      recommendedAction: priyaAction._id,
      activeAction: priyaAction._id,
    });

    await RecoveryCase.findByIdAndUpdate(vikasCase._id, {
      recommendedAction: vikasAction._id,
      activeAction: vikasAction._id,
    });

    await RecoveryCase.findByIdAndUpdate(nehaCase._id, {
      recommendedAction: nehaAction._id,
      activeAction: nehaAction._id,
    });

    await RecoveryCase.findByIdAndUpdate(arjunCase._id, {
      recommendedAction: arjunAction._id,
      activeAction: arjunAction._id,
    });

    // ============================================================
    // AUDIT LOGS
    // ============================================================

    await AuditLog.insertMany([
      {
        recoveryCase: amanCase._id,
        payment: amanFailedPayment._id,
        action: amanAction._id,
        actor: "razorpay",
        eventType: "PAYMENT_FAILED",
        message: "Razorpay reported a failed payment of ₹12,500.",
        metadata: {
          demo: true,
          failureReason: "Card declined by bank",
        },
      },

      {
        recoveryCase: amanCase._id,
        payment: amanFailedPayment._id,
        action: amanAction._id,
        actor: "ai",
        eventType: "AI_ANALYSIS_COMPLETED",
        message:
          "AI identified high recovery probability and recommended a Payment Link.",
        after: {
          riskScore: 91,
          recoveryProbability: 0.91,
          recommendedAction: "CREATE_PAYMENT_LINK",
        },
      },

      {
        recoveryCase: amanCase._id,
        payment: amanFailedPayment._id,
        action: amanAction._id,
        actor: "policy",
        eventType: "POLICY_APPROVED",
        message: "Recovery action approved by the policy engine.",
        after: {
          allowed: true,
        },
      },

      {
        recoveryCase: amanCase._id,
        payment: amanFailedPayment._id,
        action: amanAction._id,
        actor: "system",
        eventType: "PAYMENT_LINK_CREATED",
        message: "Demo Payment Link was created.",
        metadata: {
          providerReference: "plink_demo_aman_001",
        },
      },

      {
        recoveryCase: amanCase._id,
        payment: amanFailedPayment._id,
        action: amanAction._id,
        actor: "razorpay",
        eventType: "PAYMENT_RECOVERED",
        message: "Customer completed the recovery payment.",
        after: {
          recoveredAmount: 1250000,
        },
      },

      {
        recoveryCase: vikasCase._id,
        payment: vikasFailedPayment._id,
        action: vikasAction._id,
        actor: "policy",
        eventType: "HIGH_VALUE_ESCALATION",
        message: "High-value recovery case was routed to human review.",
        metadata: {
          amount: 7500000,
          threshold: 5000000,
        },
      },

      {
        recoveryCase: nehaCase._id,
        payment: nehaFailedPayment._id,
        action: nehaAction._id,
        actor: "policy",
        eventType: "ACTION_BLOCKED",
        message:
          "Reminder was blocked because the communication limit was reached.",
        after: {
          allowed: false,
        },
      },

      {
        recoveryCase: arjunCase._id,
        payment: arjunFailedPayment._id,
        action: arjunAction._id,
        actor: "ai",
        eventType: "LOW_RECOVERY_PROBABILITY",
        message:
          "AI recommended no automated recovery because historical failure rate is high.",
      },
    ]);

    // ============================================================
    // UPDATE CUSTOMER RECOVERY TOTAL
    // ============================================================

    await Customer.findByIdAndUpdate(aman._id, {
      totalRecoveredAmount: 1250000,
    });

    console.log("");
    console.log("==========================================");
    console.log("RecoverAI database seeded successfully!");
    console.log("==========================================");
    console.log(`Customers:       ${customers.length}`);
    console.log(`Payments:        ${payments.length}`);
    console.log(`Recovery Cases:  ${recoveryCases.length}`);
    console.log(`Actions:         ${recoveryActions.length}`);
    console.log("Audit Logs:      8+");
    console.log("");
    console.log("Demo scenarios:");
    console.log("1. Aman    → ₹12,500 → RECOVERED");
    console.log("2. Rahul   → Low recovery probability");
    console.log("3. Priya   → Payment Link pending");
    console.log("4. Vikas   → ₹75,000 → HUMAN ESCALATION");
    console.log("5. Neha    → Policy BLOCKED reminder");
    console.log("6. Arjun   → DO_NOTHING");
    console.log("");
  } catch (error) {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedDatabase();
