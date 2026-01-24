# Backend

Treasury, Policy Engine, and Payment execution service.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your Circle API credentials
npm run dev
```

## API Endpoints

### Treasury
- `GET /api/treasury/balance` - Current wallet balance
- `GET /api/treasury/history` - Transaction history

### Policy
- `GET /api/policy` - List active policies
- `POST /api/policy` - Create policy
- `POST /api/policy/validate` - Check if payment passes policies

### Payments
- `POST /api/payments/execute` - Execute a payment
- `GET /api/payments/:id` - Get payment status

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CIRCLE_API_KEY` | Circle Developer API key |
| `CIRCLE_ENTITY_SECRET` | Circle entity secret for signing |
| `ARC_RPC_URL` | Arc blockchain RPC endpoint |
| `PORT` | Server port (default: 3001) |
| `SUPABASE_URL` | Supabase project URL (optional, enables DB persistence) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (optional, enables DB persistence) |
