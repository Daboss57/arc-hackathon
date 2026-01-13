import { v4 as uuid } from 'uuid';
import { logger } from '../lib/logger.js';
import { validatePayment } from '../policy/engine.js';
import { getWallet, getBalance, reserveFunds, releaseFunds, recordTransaction, updateTransactionStatus } from '../treasury/wallet.service.js';
import { preparePayment, settlePayment } from './x402-client.js';
import type { PaymentRequest, PaymentResult } from './types.js';

export async function executePayment(request: PaymentRequest): Promise<PaymentResult> {
    const paymentId = `pay_${uuid().slice(0, 8)}`;
    logger.info('Starting payment execution', { paymentId, amount: request.amount, recipient: request.recipient });

    const validation = await validatePayment({
        amount: request.amount,
        recipient: request.recipient,
        category: request.category,
        description: request.description,
        metadata: request.metadata,
    });

    const appliedRules = validation.results.map(r => r.policyName);

    if (!validation.approved) {
        logger.warn('Payment rejected by policy', { paymentId, blockedBy: validation.blockedBy });
        return {
            paymentId,
            status: 'failed',
            error: `Blocked by policy: ${validation.blockedBy}`,
            policyResult: { passed: false, appliedRules, blockedBy: validation.blockedBy },
        };
    }

    const wallet = await getWallet();
    if (!wallet) {
        return {
            paymentId,
            status: 'failed',
            error: 'Wallet not initialized',
            policyResult: { passed: true, appliedRules },
        };
    }

    const reserved = await reserveFunds(request.amount);
    if (!reserved) {
        return {
            paymentId,
            status: 'failed',
            error: 'Insufficient funds',
            policyResult: { passed: true, appliedRules },
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
    });

    try {
        const paymentPayload = await preparePayment(
            {
                scheme: 'exact',
                network: 'arc',
                recipient: request.recipient,
                amount: request.amount,
                currency: 'USDC',
                resource: request.description || 'payment',
            },
            wallet.address
        );

        const settlement = await settlePayment(paymentPayload);

        if (!settlement.success) {
            await releaseFunds(request.amount);
            await updateTransactionStatus(tx.id, 'failed');
            return {
                paymentId,
                status: 'failed',
                error: settlement.error,
                policyResult: { passed: true, appliedRules },
            };
        }

        await updateTransactionStatus(tx.id, 'confirmed', settlement.txHash);
        logger.info('Payment completed', { paymentId, txHash: settlement.txHash });

        return {
            paymentId,
            status: 'completed',
            txHash: settlement.txHash,
            policyResult: { passed: true, appliedRules },
        };
    } catch (err) {
        await releaseFunds(request.amount);
        await updateTransactionStatus(tx.id, 'failed');
        logger.error('Payment execution failed', { paymentId, error: String(err) });

        return {
            paymentId,
            status: 'failed',
            error: String(err),
            policyResult: { passed: true, appliedRules },
        };
    }
}
