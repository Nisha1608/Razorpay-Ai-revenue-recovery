# 🚀 RecoverAI — Intelligent Revenue Recovery System

> **AI-powered system to recover failed payments using smart retries, payment links, and escalation — safely, transparently, and at scale.**

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white"/>
  <img src="https://img.shields.io/badge/React-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black"/>
  <img src="https://img.shields.io/badge/MongoDB-Database-47A248?style=for-the-badge&logo=mongodb&logoColor=white"/>
  <img src="https://img.shields.io/badge/Razorpay-Payments-0C2451?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/AI-Gemini%2FOpenAI-blue?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/Tests-58%2F58-success?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/Version-v0.6.0-blue?style=for-the-badge"/>
</p>

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
- [Getting Started](#-getting-started)
- [Testing](#-testing--verification)
- [Future Enhancements](#-future-enhancements)

---

## 🚨 Problem Statement

Failed payments silently kill revenue.

Most systems:
- ❌ Treat failures as final  
- ❌ No intelligent retry mechanism  
- ❌ Ignore customer/payment context  
- ❌ No visibility into recovery attempts  

👉 Result: **Revenue leakage with no recovery strategy**

---

## 💡 Solution

**RecoverAI** is a **decision-driven recovery engine** that:

- 🤖 Uses AI to recommend recovery actions  
- 🧠 Falls back to deterministic logic when AI fails  
- 🛡️ Uses a Policy Engine as final authority  
- 💳 Executes real recovery via Razorpay  
- 🔗 Tracks complete recovery lifecycle  

---

## 🏗️ Architecture

> 📌 Add your architecture image here


![Architecture Diagram](assets/architecture.png)


```

---

## 🔁 End-to-End Flow

### 1️⃣ Failure Detection
- Razorpay webhook detects failed payment  
- Payment + customer stored  
- `RecoveryCase` created  

---

### 2️⃣ AI Analysis (`/analyze`)

```
LLM (Gemini/OpenAI)
        ↓
Structured Decision
        ↓ (if fails)
Deterministic Engine (fallback)
```

Output:
- `riskScore`
- `recoveryProbability`
- `priority`
- `recommendedAction`
- `diagnosis`
- `reason`

---

### 3️⃣ Validation + Policy

- Strict schema validation  
- Policy Engine decides:

```
AI suggests → Policy decides
```

---

### 4️⃣ Human Approval

```
pending → approved
```

---

### 5️⃣ Execution (`/execute`)

| Action | Behavior |
|------|--------|
| 💳 CREATE_PAYMENT_LINK | Razorpay link (`RECOVERY_<caseId>`) |
| 🔁 RETRY_PAYMENT | New retry link (`RETRY_<caseId>`) |
| 📩 SEND_REMINDER | Notification stored |
| 💳 OFFER_ALTERNATIVE_PAYMENT | Options saved |
| 🧑‍💼 ESCALATE_TO_HUMAN | Escalation record |
| 🚫 DO_NOTHING | Case closed |

---

### 6️⃣ Payment Success

- Razorpay webhook triggers  
- Match `reference_id → recovery_case_id`  
- Case marked `recovered`  

---

## 🔗 Recovery Journey

```
Case A ❌ → Case B ❌ → Case C ✅
```

Tracked via:
- `parentRecoveryCase`
- `rootRecoveryCase`
- `attemptNumber`
- `supersededBy`
- `journeyStatus`

✔ Old cases → superseded  
✔ Latest → active  
✔ Success → full journey recovered  

---

## 🧠 AI Decision Strategy

| Risk | Mitigation |
|------|-----------|
| AI failure | Deterministic fallback |
| Hallucination | Schema validation |
| Unsafe actions | Policy engine |
| API downtime | Graceful fallback |

---

## 🔐 Safety & Reliability

- ✅ Human approval required  
- ✅ Idempotent execution  
- ✅ No fake recovery without webhook  
- ✅ Never reuse failed payment ID  
- ✅ Full audit trail  
- ✅ Strict error handling  

---

## ⚡ Key Features

- 🚀 AI-powered decisions  
- 🔁 Smart retries  
- 🛡️ Policy-controlled execution  
- 💳 Real Razorpay integration  
- 🔗 Recovery journey tracking  
- 📊 Audit logs  
- ⚙️ Deterministic fallback  
- 📱 Responsive UI  

---

## 🛠️ Tech Stack

| Layer | Technology |
|------|-----------|
| Frontend | React |
| Backend | Node.js + Express |
| Database | MongoDB |
| Payments | Razorpay |
| AI | Gemini / OpenAI |

---

## 🔑 Environment Variables

```bash
# AI Provider
RECOVERY_AI_PROVIDER=gemini
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.5-flash

# OR
RECOVERY_AI_PROVIDER=openai
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini

# Razorpay
RAZORPAY_KEY_ID=your_key
RAZORPAY_KEY_SECRET=your_secret
RAZORPAY_WEBHOOK_SECRET=your_secret
```

⚠️ Never commit `.env`  
✔ Use `.env.example`

---

## ⚡ Getting Started

```bash
# Clone repo
git clone https://github.com/your-username/recoverai.git

# Install dependencies
cd server
npm install

cd ../client
npm install

# Run backend
cd ../server
npm run dev

# Run frontend
cd ../client
npm run dev
```

---

## 🧪 Testing & Verification

- ✅ Backend: **58/58 tests passing**
- ✅ Frontend: Build successful

Covers:
- AI decisions  
- Fallback logic  
- Policy enforcement  
- Execution lifecycle  
- Webhook validation  
- Duplicate protection  

---

## 🚀 Future Enhancements

- ⏱️ Smart retry scheduling  
- 📊 Analytics dashboard  
- 📩 Email/SMS notifications  
- 🧠 ML-based learning  
- 🎯 Customer segmentation  

---

## 🏁 Final Note

> RecoverAI is not just retry logic — it's a **decision engine**.

It combines:
- AI intelligence 🧠  
- Deterministic reliability ⚙️  
- Policy control 🛡️  

to maximize recovered revenue safely.

---

<p align="center">
🔥 Built for hackathons. Designed for production. Ready to scale.
</p>