# 🚀 RecoverAI — Intelligent Revenue Recovery System

> **AI-driven system to recover failed payments using smart retries, payment links, and escalation — safely and transparently.**

![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-Frontend-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Razorpay](https://img.shields.io/badge/Razorpay-Payments-0C2451?style=flat-square)
![AI](https://img.shields.io/badge/Gemini%2FOpenAI-AI_Layer-4285F4?style=flat-square)
![Tests](https://img.shields.io/badge/Tests-58%2F58_Passing-success?style=flat-square)
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
- [Future Enhancements](#-future-enhancements)

---

## 🚨 Problem Statement

Failed payments silently kill revenue.

Most systems:
- Treat failures as final
- Don’t retry intelligently
- Ignore context (customer history, failure reason)
- Provide zero visibility into recovery attempts

---

## 💡 Solution

**RecoverAI** introduces a **decision-driven recovery engine**:

- 🤖 AI suggests the best recovery action  
- 🧠 Deterministic engine guarantees fallback  
- 🛡️ Policy engine controls execution (final authority)  
- 💳 Razorpay executes real payment recovery  
- 🔗 Recovery Journey tracks full lifecycle  

---

## 🏗️ Architecture

```mermaid
flowchart TB

subgraph Frontend
    A1[React App]
    A2[Dashboard]
    A3[Case Detail and Timeline]
end

subgraph Backend
    B1[Express Server]
    B2[Recovery APIs]
end

subgraph AI_Layer
    C1[LLM Provider Gemini or OpenAI]
    C2[Deterministic Engine]
    C3[Decision Validator]
end

subgraph Policy
    D1[Policy Engine Final Authority]
end

subgraph Execution
    E1[Recovery Actions]
    E2[Create Payment Link]
    E3[Retry Payment]
    E4[Notify or Escalate]
end

subgraph External
    F1[Razorpay API]
    F2[Webhooks]
end

subgraph Database
    G1[MongoDB]
    G2[Recovery Cases]
    G3[Payments]
    G4[Customers]
    G5[Audit Logs]
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
