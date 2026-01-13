# docs

Additional documentation for the project.

## Architecture

See [implementation_plan.md](../implementation_plan.md) for full architecture details.

## API Reference

### Treasury

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/treasury/balance` | GET | Get current wallet balance |
| `/api/treasury/history` | GET | Get transaction history |
| `/api/treasury/wallet` | GET | Get wallet info |

### Policy

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/policy` | GET | List all policies |
| `/api/policy` | POST | Create new policy |
| `/api/policy/:id` | PUT | Update policy |
| `/api/policy/:id` | DELETE | Delete policy |
| `/api/policy/validate` | POST | Validate payment against policies |

### Payments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/payments/execute` | POST | Execute a payment |

## Policy Rule Types

| Rule | Params | Description |
|------|--------|-------------|
| `maxPerTransaction` | `{ max: number }` | Cap individual payments |
| `dailyLimit` | `{ limit: number }` | Rolling 24h spend cap |
| `monthlyBudget` | `{ budget: number }` | Calendar month budget |
| `vendorWhitelist` | `{ addresses: string[] }` | Approved recipients |
| `categoryLimit` | `{ limits: { [category]: number } }` | Per-category limits |
