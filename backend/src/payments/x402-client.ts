/**
 * Circle x402 Bridge
 * Uses Circle's Developer-Controlled Wallet SDK for x402 micropayments
 * This allows AI agents to autonomously pay for API access
 */

import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { validatePayment } from '../policy/engine.js';
import { getSpendingAnalytics, getWallet, transferUsdc, recordTransaction } from '../treasury/wallet.service.js';

export interface X402FetchResult {
    success: boolean;
    data?: unknown;
    paymentMade?: boolean;
    paymentAmount?: string;
    txHash?: string;
    error?: string;
    policyBlocked?: boolean;
}

/**
 * Make an x402-aware fetch request using Circle wallet for payments
 * Flow:
 * 1. Make initial request to check if payment is required
 * 2. If 402 returned, parse payment requirements
 * 3. Validate payment against policies
 * 4. Execute payment via Circle's createTransaction
 * 5. Retry request with payment proof
 */
export async function x402Fetch(
    url: string,
    options: RequestInit = {},
    category?: string,
    userId?: string
): Promise<X402FetchResult> {
    const wallet = await getWallet();
    if (!wallet) {
        return { success: false, error: 'Wallet not initialized' };
    }

    try {
        // Step 1: Make initial request
        const initialResponse = await fetch(url, options);

        if (initialResponse.status !== 402) {
            // No payment required
            const data = await initialResponse.json().catch(() => initialResponse.text());
            return { success: true, data, paymentMade: false };
        }

        // Step 2: Parse payment requirements from 402 response
        const paymentRequiredHeader = initialResponse.headers.get('x-payment-required');
        if (!paymentRequiredHeader) {
            return { success: false, error: '402 returned but no payment requirements' };
        }

        let paymentRequirements: {
            amount: string;
            recipient: string;
            network?: string;
            resource?: string;
        };

        try {
            paymentRequirements = JSON.parse(
                Buffer.from(paymentRequiredHeader, 'base64').toString()
            );
        } catch {
            return { success: false, error: 'Failed to parse payment requirements' };
        }

        logger.info('402 Payment Required (Circle x402)', {
            url,
            amount: paymentRequirements.amount,
            recipient: paymentRequirements.recipient,
            userId
        });

        // Step 3: Validate against policies
        const policyCheck = await validatePayment({
            amount: paymentRequirements.amount,
            recipient: paymentRequirements.recipient || new URL(url).hostname,
            category: category || 'x402-api',
            description: `x402 payment for ${url}`,
            metadata: { userId },
        });

        if (!policyCheck.approved) {
            logger.warn('x402 payment blocked by policy', {
                blockedBy: policyCheck.blockedBy
            });
            return {
                success: false,
                policyBlocked: true,
                error: `Payment blocked by policy: ${policyCheck.blockedBy}`,
            };
        }

        // Step 4: Execute payment via Circle's createTransaction
        logger.info('Executing x402 payment via Circle transfer');

        const transferResult = await transferUsdc(
            paymentRequirements.recipient,
            paymentRequirements.amount,
            userId
        );

        if (!transferResult.success) {
            logger.error('x402 payment transfer failed', { error: transferResult.error });
            return {
                success: false,
                error: `Payment failed: ${transferResult.error}`,
            };
        }

        // Record the transaction for analytics
        await recordTransaction({
            type: 'x402-payment',
            amount: paymentRequirements.amount,
            recipient: paymentRequirements.recipient,
            txHash: transferResult.txHash,
            status: 'confirmed',
            category: category || 'x402-api',
            description: `x402 payment for ${new URL(url).pathname}`,
            userId,
        });

        logger.info('x402 payment completed and recorded', {
            txHash: transferResult.txHash,
            amount: paymentRequirements.amount
        });

        // Step 5: Retry with payment proof (txHash as proof)
        const paymentProof = Buffer.from(JSON.stringify({
            txHash: transferResult.txHash,
            from: wallet.address,
            to: paymentRequirements.recipient,
            amount: paymentRequirements.amount,
            timestamp: Date.now(),
            userId
        })).toString('base64');

        const paidResponse = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'x-payment': paymentProof,
            },
        });

        if (!paidResponse.ok && paidResponse.status !== 200) {
            // Even if retry fails, payment was made
            return {
                success: true,
                paymentMade: true,
                paymentAmount: paymentRequirements.amount,
                txHash: transferResult.txHash,
                data: { message: 'Payment made but content access pending confirmation' },
            };
        }

        const data = await paidResponse.json().catch(() => paidResponse.text());

        // Update analytics warning check
        const analytics = await getSpendingAnalytics(userId);
        if (analytics.warning) {
            logger.warn(analytics.warning);
        }

        return {
            success: true,
            data,
            paymentMade: true,
            paymentAmount: paymentRequirements.amount,
            txHash: transferResult.txHash,
        };
    } catch (err) {
        logger.error('x402 fetch failed', { url, error: String(err) });
        return { success: false, error: String(err) };
    }
}

/**
 * Check if x402 payments are enabled
 */
export function isX402Enabled(): boolean {
    return !!(config.CIRCLE_WALLET_ID && config.CIRCLE_ENTITY_SECRET);
}
