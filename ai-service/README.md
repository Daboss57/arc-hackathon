# AI Service

Financial Advisor and Autonomous Buyer Agent.

## Teammate 1's Domain

This service contains:
- **Financial Advisor** - Analyzes user finances and makes recommendations
- **Buyer Agent** - Discovers vendors, compares prices, selects optimal services

## Setup

```bash
# Create a virtual environment (optional but recommended)
python -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt
# Update ai-service/.env with your Gemini API key
python src/agent.py
```

## Tool Integration

The AI service can call the backend APIs (treasury, policy, payments, vendors) via Gemini tools.
Set `BACKEND_URL` in `ai-service/.env` (defaults to `http://localhost:3001`).

## API Endpoints

```
POST /api/chats                   - Create a chat for a user
GET  /api/users/:userId/chats     - List chats for a user
GET  /api/chats/:chatId           - Get chat metadata
GET  /api/chats/:chatId/messages  - List chat messages
POST /api/chats/:chatId/messages  - Add a message (optionally generate reply)
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
