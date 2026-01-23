# AutoWealth Agent

AI Spend Optimizer for autonomous commerce on Arc with USDC and x402.

## Overview

AutoWealth is a trustless AI agent that proposes budget guardrails, lets users review and approve them, then autonomously pays per-use onchain — all under transparent, user-defined rules.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│                    (Dashboard + Wallet UI)                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                        AI Service                                │
│         ┌─────────────────┴─────────────────┐                   │
│         │                                   │                   │
│  Financial Advisor              Autonomous Buyer                │
│  (analyzes, recommends)         (discovers, compares)           │
└─────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                         Backend                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐       │
│  │   Treasury   │  │    Policy    │  │     Payments     │       │
│  │   Manager    ├──┤    Engine    ├──┤   (x402/USDC)    │       │
│  └──────────────┘  └──────────────┘  └──────────────────┘       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   Circle Wallets      Arc Blockchain     x402 Facilitator
```

## Tech Stack

- **Blockchain**: Arc (EVM L1 with USDC as native gas)
- **Wallets**: Circle Developer-Controlled Wallets
- **Payments**: x402 micropayment protocol
- **AI**: Gemini Flash / Pro via Google AI Studio
- **Backend**: Node.js + TypeScript + Express
- **Frontend**: (TBD by team)

## Project Structure

```
arc-hackathon/
├── backend/          # Treasury, Policy Engine, Payment execution
├── ai-service/       # Financial Advisor + Buyer Agent
├── frontend/         # Dashboard UI
└── docs/             # Additional documentation
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm
- Circle API credentials (get from early access program)
- Google AI Studio API key

### Quick Start

```bash
# Clone the repo
git clone https://github.com/Daboss57/arc-hackathon.git
cd arc-hackathon

# Install all workspaces
npm install

# Copy environment files
cp backend/.env.example backend/.env
cp ai-service/.env.example ai-service/.env
cp frontend/.env.example frontend/.env

# Fill frontend/.env with Supabase credentials:
# VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# Supabase table (user_settings)
# Columns:
# user_id (uuid, primary key, references auth.users)
# display_name (text)
# monthly_budget (numeric)
# safe_mode (boolean)
# auto_budget (boolean)
# ui_scale (numeric)
# updated_at (timestamptz default now())

# Start backend
cd backend && npm run dev

# Start AI service (separate terminal)
cd ai-service && npm run dev
```

## Team

| Role | Focus |
|------|-------|
| Person 1 | Financial advisor logic + policy modeling |
| Person 2 | Onchain treasury + micropayments (backend) |
| Person 3 | Buyer logic + UI / demo polish |

## Demo Focus

- **Use case:** Keep AI API spend under a monthly budget while the agent pays per-use.
- **Review flow:** Advisor proposes limits → user approves → policy enforces every payment.
- **Proof:** Receipts show tx hash + policy that allowed the payment.

## Hackathon Tracks

- 🤖 Best Trustless AI Agent
- 🛒 Best Autonomous Commerce Application

## License

MIT
