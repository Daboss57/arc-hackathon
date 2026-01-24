import { v4 as uuid } from 'uuid';
import { logger } from '../lib/logger.js';
import { validatePayment } from '../policy/engine.js';
import {
    getWallet,
    reserveFunds,
    releaseFunds,
    recordTransaction,
    updateTransactionStatus,
    transferUsdc
} from '../treasury/wallet.service.js';
import type { PaymentRequest, PaymentResult } from './types.js';

export async function executePayment(request: PaymentRequest): Promise<PaymentResult> {
    const paymentId = `pay_${uuid().slice(0, 8)}`;
    logger.info('Starting payment execution', {
        paymentId,
        amount: request.amount,
        recipient: request.recipient
    });

    if (!request.userId) {
        return {
            paymentId,
            status: 'failed',
            error: 'User ID required to execute payment',
            policyResult: { passed: false, appliedRules: [], blockedBy: 'Missing User' },
        };
    }

    const validation = await validatePayment({
        amount: request.amount,
        recipient: request.recipient,
        category: request.category,
        description: request.description,
        metadata: {
            ...(request.metadata || {}),
            userId: request.userId,
        },
    });

    const appliedPolicies = validation.results.map(r => r.policyName);
    const policyMeta = {
        approved: validation.approved,
        appliedPolicies,
        blockedBy: validation.blockedBy,
    };

    if (!validation.approved) {
        logger.warn('Payment rejected by policy', { paymentId, blockedBy: validation.blockedBy });
        return {
            paymentId,
            status: 'failed',
            error: `Blocked by policy: ${validation.blockedBy}`,
            policyResult: { passed: false, appliedRules: appliedPolicies, blockedBy: validation.blockedBy },
        };
    }

    const wallet = await getWallet();
    if (!wallet) {
        return {
            paymentId,
            status: 'failed',
            error: 'Wallet not initialized',
            policyResult: { passed: true, appliedRules: appliedPolicies },
        };
    }

    const reserved = await reserveFunds(request.amount);
    if (!reserved) {
        return {
            paymentId,
            status: 'failed',
            error: 'Insufficient funds',
            policyResult: { passed: true, appliedRules: appliedPolicies },
        };
    }

    const tx = await recordTransaction({
        txHash: '',
        from: wallet.address,
        to: request.recipient,
        amount: request.amount,
        currency: 'USDC',
        status: 'pending',
        category: request.category,
        description: request.description,
        policy: policyMeta,
        userId: request.userId,
    });

    try {
        // Execute real USDC transfer via Circle
        const transfer = await transferUsdc(request.recipient, request.amount, request.userId);

        if (!transfer.success) {
            await releaseFunds(request.amount);
            await updateTransactionStatus(tx.id, 'failed');
            return {
                paymentId,
                status: 'failed',
                error: transfer.error || 'Transfer failed',
                policyResult: { passed: true, appliedRules: appliedPolicies },
            };
        }

        // Update with real transaction hash
        const txHash = transfer.txHash || transfer.transactionId || '';
        await updateTransactionStatus(tx.id, 'confirmed', txHash);

        // Clear reservation since Circle has already deducted the balance
        await releaseFunds(request.amount);

        logger.info('Payment completed via Circle', {
            paymentId,
            transactionId: transfer.transactionId,
            txHash: transfer.txHash,
            state: transfer.state
        });

        return {
            paymentId,
            status: 'completed',
            txHash,
            policyResult: { passed: true, appliedRules: appliedPolicies },
        };
    } catch (err) {
        await releaseFunds(request.amount);
        await updateTransactionStatus(tx.id, 'failed');
        logger.error('Payment execution failed', { paymentId, error: String(err) });

        return {
            paymentId,
            status: 'failed',
            error: String(err),
            policyResult: { passed: true, appliedRules: appliedPolicies },
        };
    }
}
