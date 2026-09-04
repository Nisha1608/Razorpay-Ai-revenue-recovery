# 🚀 RecoverAI — Intelligent Revenue Recovery System

> **AI-driven recovery for failed payments — retry, remind, or escalate, automatically.**

![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-Frontend-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Razorpay](https://img.shields.io/badge/Razorpay-Payments-0C2451?style=flat-square)
![Gemini](https://img.shields.io/badge/Gemini%2FOpenAI-AI_Layer-4285F4?style=flat-square&logo=google)
![Tests](https://img.shields.io/badge/Backend_Tests-58%2F58_Passing-success?style=flat-square)
![Version](https://img.shields.io/badge/version-v0.6.0-blue?style=flat-square)

---

## 📋 Table of Contents
- [Problem Statement](#-problem-statement)
- [Solution](#-solution)
- [Architecture](#-architecture)
- [End-to-End Flow](#-end-to-end-flow)
- [Recovery Journey](#-recovery-journey)
- [AI Decision Strategy](#-ai-decision-strategy)
- [Safety & Reliability](#-safety--reliability)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Environment Variables](#-environment-variables)
- [Testing](#-testing--verification)
- [Future Enhancements](#-future-enhancements-phase-7)

---

## 🚨 Problem Statement
Failed payments quietly drain revenue. Most systems:
- Don't retry intelligently — they treat every failure as final
- Ignore context (why it failed, how many attempts, customer history)
- Give zero visibility into recovery attempts or outcomes

**RecoverAI** fixes this by analyzing every failure, recommending the best recovery action, executing it safely through Razorpay, and tracking the full recovery lifecycle.

## 💡 Solution
RecoverAI combines:
- **Deterministic rule engine** — reliable, always-available fallback
- **LLM intelligence** (Gemini/OpenAI) — context-aware recovery decisions
- **Policy engine** — final authority over what actually executes
- **Real Razorpay integration** — payment links, retries, webhooks
- **Recovery Journey tracking** — chains multiple attempts into one story

---

## 🏗️ Architecture
```mermaid
flowchart TB

subgraph UI["🖥️ Frontend Layer"]
    A1["React App"]
    A2["Dashboard"]
    A3["Case Detail + Timeline"]
end

subgraph API["⚙️ Backend API Layer"]
    B1["Express Server"]
    B2["Recovery APIs"]
end

subgraph AI["🧠 Intelligence Layer"]
    C1["LLM (Gemini / OpenAI)"]
    C2["Deterministic Engine"]
    C3["Decision Validator"]
end

subgraph POLICY["🛡️ Policy Control"]
    D1["Policy Engine (Final Authority)"]
end

subgraph ACTION["⚡ Execution Layer"]
    E1["Recovery Actions"]
    E2["Payment Link Generator"]
    E3["Retry Handler"]
    E4["Notification / Escalation"]
end

subgraph EXT["🌐 External Systems"]
    F1["Razorpay API"]
    F2["Webhooks"]
end

subgraph DB["💾 Data Layer"]
    G1["MongoDB"]
    G2["Recovery Cases"]
    G3["Payments"]
    G4["Customers"]
    G5["Audit Logs"]
end

A1 --> B1
A2 --> B2
A3 --> B2

B1 --> C1
B1 --> C2

C1 --> C3
C2 --> C3

C3 --> D1

D1 -->|Approved| E1
D1 -->|Blocked| B1

E1 --> E2
E1 --> E3
E1 --> E4

E2 --> F1
E3 --> F1

F1 --> F2
F2 --> B1

B1 --> G1
G1 --> G2
G1 --> G3
G1 --> G4
G1 --> G5

## 🔁 End-to-End Flow

**1. Failure Detection** — Razorpay webhook fires on a failed payment → payment + customer data stored → a `RecoveryCase` is created.

**2. AI Analysis (`/analyze`)**
```
LLM (Gemini/OpenAI) → structured JSON decision
        ↓ (on failure)
Deterministic Engine (fallback)
```
Output: `riskScore`, `recoveryProbability`, `priority`, `recommendedAction`, `diagnosis`, `reason`.

- **Validation** — strict schema checks block hallucinated actions and out-of-range values.
- **Policy Engine (final authority)** — AI suggests, policy decides, checking retry limits, case status, failure reason, and business rules.
- **Action Creation** — if allowed, a `RecoveryAction` is created (`pending`); case → `action_pending`.

**3. Human Approval** — a person reviews and moves the action `pending → approved`.

**4. Execution (`/execute`)** — by action type:
| Action | Behavior |
|---|---|
| 💳 `CREATE_PAYMENT_LINK` | New Razorpay Payment Link, ref `RECOVERY_<caseId>` |
| 🔁 `RETRY_PAYMENT` | New Payment Link, ref `RETRY_<caseId>` (never reuses the failed payment ID) |
| 📩 `SEND_REMINDER` | Creates a notification record |
| 💳 `OFFER_ALTERNATIVE_PAYMENT` | Stores alternative payment options |
| 🧑‍💼 `ESCALATE_TO_HUMAN` | Creates an escalation record |
| 🚫 `DO_NOTHING` | Closes the case intentionally |

**5. Payment Completion** — on success, Razorpay's webhook fires again; the system matches `reference_id → recovery_case_id`, marks the case `recovered`, and logs the revenue as recovered.

---

## 🔗 Recovery Journey
Chains multiple recovery attempts instead of treating each as isolated:
```
Case A (failed) → retry → Case B (failed) → retry → Case C (success)
```
Tracked via `parentRecoveryCase`, `rootRecoveryCase`, `supersededBy`, `attemptNumber`, `journeyStatus`. Older cases are marked `superseded`; the latest stays `active`; a final success marks the **entire journey** as recovered.

---

## 🧠 AI Decision Strategy
**Hybrid intelligence**: primary LLM (Gemini/OpenAI) with a deterministic fallback.

| Risk | Mitigation |
|---|---|
| LLM failure | Deterministic fallback engine |
| Hallucination | Strict schema validation |
| Unsafe action | Policy engine has final say |
| API downtime | Graceful fallback, no crash |

---

## 🔐 Safety & Reliability
- No execution without human approval
- No duplicate execution (idempotent)
- Never retries a failed Razorpay payment ID — always issues a new one
- No case marked `recovered` without a real success webhook
- `void@razorpay.com` excluded as a valid identity
- Strict HTTP error handling (422 vs 500)

---

## 📊 Key Features
✅ AI-powered recovery recommendations · ✅ Deterministic fallback · ✅ Policy-controlled execution · ✅ Real Razorpay integration · ✅ Recovery journey tracking · ✅ Audit trail per action · ✅ Idempotent execution · ✅ Responsive UI, no raw JSON leaks

---

## 🛠️ Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React |
| Backend | Node.js + Express |
| Database | MongoDB |
| Payments | Razorpay (Payments + Payment Links + Webhooks) |
| AI | Gemini or OpenAI (pluggable provider) |

---

## 🔑 Environment Variables

```bash
# AI Provider — choose one
RECOVERY_AI_PROVIDER=gemini
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.5-flash

# or
RECOVERY_AI_PROVIDER=openai
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini

# Razorpay
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```
> Keep real keys in `.env` (never commit). Commit only `.env.example`.

---

## 🧪 Testing & Verification
- **Backend:** 58/58 tests passing
- **Frontend:** build passing

Covers: AI decision validation, fallback behavior, policy enforcement, action lifecycle, Razorpay execution logic, webhook handling, duplicate prevention.

---

## 🚀 Future Enhancements (Phase 7+)
- Automated retry scheduling
- Customer segmentation (LTV-based recovery)
- Multi-channel notifications (SMS/Email)
- ML-based learning from past recoveries
- Real dashboard analytics (conversion rate, recovery rate)

---

<div align="center">

**RecoverAI — a decision-driven recovery engine combining AI intelligence, deterministic reliability, and strict business policy to maximize recovered revenue safely and transparently.**

</div>