# AI Service

Financial Advisor and Autonomous Buyer Agent.

## Teammate 1's Domain

This service contains:
- **Financial Advisor** - Analyzes user finances and makes recommendations
- **Buyer Agent** - Discovers vendors, compares prices, selects optimal services

## Setup

```bash
npm install
cp .env.example .env
# Add your Gemini API key
npm run dev
```

## Integration with Backend

The AI agents call the backend treasury API to execute payments:

```typescript
// Check if payment would pass policies
POST http://localhost:3001/api/policy/validate
{ "amount": "5.00", "recipient": "0x...", "category": "ai-api" }

// Execute the payment
POST http://localhost:3001/api/payments/execute
{ "amount": "5.00", "recipient": "0x...", "category": "ai-api", "description": "GPT-4 API call" }
```

## Gemini Models

- **Gemini Flash** - For fast transactional decisions
- **Gemini Pro** - For complex financial analysis and reasoning
