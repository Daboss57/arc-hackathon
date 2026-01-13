# Frontend

Dashboard UI for AutoWealth Agent.

## Teammate 3's Domain

This workspace is for the dashboard that shows:
- Current wallet balance and spending
- Active policies and constraints
- Transaction history
- Financial advisor recommendations
- Real-time spending alerts

## Getting Started

Initialize with your preferred framework:

```bash
# Option 1: Vite + React
npx -y create-vite@latest . --template react-ts

# Option 2: Next.js
npx -y create-next-app@latest . --typescript
```

## Backend API Endpoints

```
GET  /api/treasury/balance     - Current USDC balance
GET  /api/treasury/history     - Transaction history
GET  /api/policy               - List active spending policies
POST /api/policy/validate      - Check if payment would pass
POST /api/payments/execute     - Execute a payment
```

Backend runs on `http://localhost:3001`

## Design Inspiration

- Financial dashboard aesthetics
- Clean data visualization for spending
- Alert/warning states for budget limits
- Mobile-responsive for demo
