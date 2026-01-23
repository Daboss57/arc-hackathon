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
# Optional: override service URLs when hosting
# VITE_AI_SERVICE_URL and VITE_BACKEND_URL

# Supabase Auth email (avoid rate limits)
# In Supabase Dashboard: Authentication -> Settings -> SMTP
# - Enable custom SMTP and provide your provider credentials (SendGrid/Mailgun/etc.)
# - In dev, you can also disable "Confirm email" to avoid email throttling

# Supabase table (user_settings)
# Columns:
# user_id (uuid, primary key, references auth.users)
# display_name (text)
# monthly_budget (numeric)
# safe_mode (boolean)
# auto_budget (boolean)
# ui_scale (numeric)
# updated_at (timestamptz default now())

# Supabase tables for chats (required)
# Run in Supabase SQL editor:
# create table public.chats (
#   id text primary key,
#   user_id uuid references auth.users on delete cascade,
#   title text,
#   system_prompt text,
#   model text,
#   created_at timestamptz default now(),
#   updated_at timestamptz default now()
# );
#
# create table public.chat_messages (
#   id text primary key,
#   chat_id text references public.chats on delete cascade,
#   user_id uuid references auth.users on delete cascade,
#   role text not null,
#   content text not null,
#   metadata jsonb,
#   created_at timestamptz default now()
# );
#
# create index on public.chat_messages (chat_id, created_at);
# In ai-service/.env set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

# Start backend
cd backend && npm run dev

# Start AI service (separate terminal)
cd ai-service && npm run dev
```

## Hosting (single backend server + static frontend)

```bash
# Build the frontend
cd frontend && npm run build

# Build the backend
cd backend && npm run build

# Serve the built frontend from the backend
# Set SERVE_FRONTEND=true (and FRONTEND_DIST if your dist path differs)
SERVE_FRONTEND=true npm run start
```

Set `VITE_AI_SERVICE_URL` and `VITE_BACKEND_URL` in `frontend/.env` to your hosted endpoints.

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
