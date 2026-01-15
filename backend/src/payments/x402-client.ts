/**
 * Circle x402 Bridge
 * Uses Circle's Developer-Controlled Wallet SDK to sign x402 payment payloads
 * This allows using Circle for treasury management AND x402 for micropayments
 */

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { validatePayment } from '../policy/engine.js';
import { getSpendingAnalytics, getWallet } from '../treasury/wallet.service.js';

let circleClient: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

function getCircleClient() {
    if (!circleClient) {
        if (!config.CIRCLE_ENTITY_SECRET) {
            throw new Error('CIRCLE_ENTITY_SECRET is required for Circle SDK');
        }
        circleClient = initiateDeveloperControlledWalletsClient({
            apiKey: config.CIRCLE_API_KEY,
            entitySecret: config.CIRCLE_ENTITY_SECRET,
        });
    }
    return circleClient;
}

export interface X402FetchResult {
    success: boolean;
    data?: unknown;
    paymentMade?: boolean;
    paymentAmount?: string;
    error?: string;
    policyBlocked?: boolean;
}

/**
 * Sign EIP-712 typed data using Circle wallet
 */
async function signWithCircle(typedData: string): Promise<string | null> {
    if (!config.CIRCLE_WALLET_ID) {
        logger.error('No CIRCLE_WALLET_ID configured');
        return null;
    }

    try {
        logger.info('Attempting Circle signTypedData', {
            walletId: config.CIRCLE_WALLET_ID,
            dataPreview: typedData.substring(0, 200) + '...'
        });

        const client = getCircleClient();
        const response = await client.signTypedData({
            walletId: config.CIRCLE_WALLET_ID,
            data: typedData,
        });

        logger.info('Circle signTypedData response', {
            hasSignature: !!response.data?.signature,
            responseData: JSON.stringify(response.data)
        });

        return response.data?.signature || null;
    } catch (err: unknown) {
        const errObj = err as { response?: { data?: unknown }; message?: string };
        logger.error('Circle signing failed', {
            error: errObj.message || String(err),
            responseData: errObj.response?.data ? JSON.stringify(errObj.response.data) : 'none'
        });
        return null;
    }
}

/**
 * Make an x402-aware fetch request using Circle wallet for signing
 * Flow:
 * 1. Make initial request
 * 2. If 402 returned, parse payment requirements
 * 3. Validate against policies
 * 4. Sign payment with Circle wallet
 * 5. Retry request with signed payment
 */
export async function x402Fetch(
    url: string,
    options: RequestInit = {},
    category?: string
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
            recipient: paymentRequirements.recipient
        });

        // Step 3: Validate against policies
        const policyCheck = await validatePayment({
            amount: paymentRequirements.amount,
            recipient: paymentRequirements.recipient || new URL(url).hostname,
            category: category || 'x402-api',
            description: `x402 payment for ${url}`,
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

        // Step 4: Create and sign payment payload with Circle
        // The x402 protocol uses EIP-3009 receiveWithAuthorization
        // Convert amount to smallest units (USDC has 6 decimals)
        const amountInSmallestUnits = Math.floor(parseFloat(paymentRequirements.amount) * 1_000_000).toString();
        const nonceHex = '0x' + Date.now().toString(16).padStart(64, '0'); // bytes32 format

        const paymentPayload = {
            from: wallet.address,
            to: paymentRequirements.recipient,
            value: amountInSmallestUnits,
            validAfter: '0',
            validBefore: Math.floor(Date.now() / 1000 + 3600).toString(), // 1 hour validity
            nonce: nonceHex,
        };

        // EIP-712 typed data for signing
        // Get chain ID from wallet's blockchain
        const chainIdMap: Record<string, number> = {
            'ARC-TESTNET': 1620,
            'ETH-SEPOLIA': 11155111,
            'MATIC-AMOY': 80002,
            'AVAX-FUJI': 43113,
            'ARB-SEPOLIA': 421614,
            'BASE-SEPOLIA': 84532,
            // Add more as needed
        };
        const walletChainId = chainIdMap[wallet.blockchain] || parseInt(config.ARC_CHAIN_ID);

        logger.info('Using chain ID for signing', {
            walletBlockchain: wallet.blockchain,
            chainId: walletChainId
        });

        const typedData = JSON.stringify({
            types: {
                EIP712Domain: [
                    { name: 'name', type: 'string' },
                    { name: 'version', type: 'string' },
                    { name: 'chainId', type: 'uint256' },
                ],
                ReceiveWithAuthorization: [
                    { name: 'from', type: 'address' },
                    { name: 'to', type: 'address' },
                    { name: 'value', type: 'uint256' },
                    { name: 'validAfter', type: 'uint256' },
                    { name: 'validBefore', type: 'uint256' },
                    { name: 'nonce', type: 'bytes32' },
                ],
            },
            domain: {
                name: 'USD Coin',
                version: '2',
                chainId: walletChainId,
            },
            primaryType: 'ReceiveWithAuthorization',
            message: paymentPayload,
        });

        const signature = await signWithCircle(typedData);
        logger.info('Signature received', { signature });
        if (!signature) {
            return { success: false, error: 'Failed to sign payment with Circle wallet' };
        }

        // Step 5: Retry with signed payment
        const paymentHeader = Buffer.from(JSON.stringify({
            ...paymentPayload,
            signature,
        })).toString('base64');

        const paidResponse = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'x-payment': paymentHeader,
            },
        });

        if (!paidResponse.ok) {
            return {
                success: false,
                error: `Paid request failed with status ${paidResponse.status}`,
            };
        }

        const data = await paidResponse.json().catch(() => paidResponse.text());

        logger.info('x402 payment completed via Circle', {
            url,
            amount: paymentRequirements.amount
        });

        // Update analytics warning check
        const analytics = await getSpendingAnalytics();
        if (analytics.warning) {
            logger.warn(analytics.warning);
        }

        return {
            success: true,
            data,
            paymentMade: true,
            paymentAmount: paymentRequirements.amount,
        };
    } catch (err) {
        logger.error('x402 fetch failed', { url, error: String(err) });
        return { success: false, error: String(err) };
    }
}

/**
 * Check if Circle x402 is enabled
 */
export function isX402Enabled(): boolean {
    return !!(config.CIRCLE_WALLET_ID && config.CIRCLE_ENTITY_SECRET);
}
