// Placeholder for AI Service entry point
// Teammate 1: Build Financial Advisor and Buyer Agent here

import 'dotenv/config';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

interface PaymentRequest {
    recipient: string;
    amount: string;
    category?: string;
    description?: string;
}

export async function requestPayment(request: PaymentRequest) {
    const response = await fetch(`${BACKEND_URL}/api/payments/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    return response.json();
}

export async function checkBalance() {
    const response = await fetch(`${BACKEND_URL}/api/treasury/balance`);
    return response.json();
}

export async function validatePayment(request: PaymentRequest) {
    const response = await fetch(`${BACKEND_URL}/api/policy/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    return response.json();
}

console.log('AI Service placeholder - implement Financial Advisor and Buyer Agent here');
console.log(`Backend URL: ${BACKEND_URL}`);
