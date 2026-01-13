import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import type { X402PaymentRequired, X402PaymentPayload } from './types.js';

export function parse402Response(headers: Record<string, string>): X402PaymentRequired | null {
    const paymentHeader = headers['x-payment'] || headers['X-Payment'];
    if (!paymentHeader) return null;

    try {
        return JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));
    } catch {
        logger.error('Failed to parse x402 payment header');
        return null;
    }
}

export async function preparePayment(
    paymentInfo: X402PaymentRequired,
    fromAddress: string
): Promise<X402PaymentPayload> {
    const now = Math.floor(Date.now() / 1000);
    const nonce = `0x${Date.now().toString(16)}`;

    return {
        scheme: paymentInfo.scheme,
        network: paymentInfo.network,
        payload: {
            signature: '', // Would be signed by Circle wallet
            authorization: {
                from: fromAddress,
                to: paymentInfo.recipient,
                value: paymentInfo.amount,
                validAfter: now,
                validBefore: now + 300, // 5 minutes
                nonce,
            },
        },
    };
}

export async function verifyPayment(payload: X402PaymentPayload): Promise<{ valid: boolean; error?: string }> {
    if (!config.X402_FACILITATOR_URL) {
        logger.warn('x402 facilitator URL not configured, skipping verification');
        return { valid: true };
    }

    try {
        const response = await fetch(`${config.X402_FACILITATOR_URL}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            return { valid: false, error: `Verification failed: ${response.status}` };
        }

        const result = await response.json() as { valid: boolean };
        return { valid: result.valid };
    } catch (err) {
        logger.error('x402 verification error', { error: String(err) });
        return { valid: false, error: 'Verification request failed' };
    }
}

export async function settlePayment(payload: X402PaymentPayload): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!config.X402_FACILITATOR_URL) {
        logger.warn('x402 facilitator URL not configured, simulating settlement');
        return { success: true, txHash: `0x${Date.now().toString(16)}${'0'.repeat(48)}` };
    }

    try {
        const response = await fetch(`${config.X402_FACILITATOR_URL}/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            return { success: false, error: `Settlement failed: ${response.status}` };
        }

        const result = await response.json() as { txHash: string };
        return { success: true, txHash: result.txHash };
    } catch (err) {
        logger.error('x402 settlement error', { error: String(err) });
        return { success: false, error: 'Settlement request failed' };
    }
}
