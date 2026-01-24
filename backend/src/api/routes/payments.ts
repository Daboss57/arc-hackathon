import { Router } from 'express';
import { executePayment } from '../../payments/executor.js';
import { x402Fetch, isX402Enabled } from '../../payments/x402-client.js';

const router = Router();

router.post('/execute', async (req, res) => {
    const { recipient, amount, category, description, metadata } = req.body;

    if (!recipient || !amount) {
        return res.status(400).json({ error: 'recipient and amount are required' });
    }

    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
        return res.status(400).json({ error: 'x-user-id header is required' });
    }

    const result = await executePayment({ recipient, amount, category, description, metadata, userId });

    if (result.status === 'failed') {
        return res.status(400).json(result);
    }

    res.json(result);
});

// x402 proxy endpoint - AI agent uses this to access paid APIs
router.post('/x402/fetch', async (req, res) => {
    const { url, method = 'GET', body, headers, category, metadata } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'url is required' });
    }

    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
        return res.status(400).json({ error: 'x-user-id header is required' });
    }

    const result = await x402Fetch(
        url,
        {
            method,
            headers: headers || {},
            body: body ? JSON.stringify(body) : undefined,
        },
        category,
        userId,
        metadata
    );

    if (result.policyBlocked) {
        return res.status(403).json(result);
    }

    if (!result.success) {
        return res.status(400).json(result);
    }

    res.json(result);
});

// Check if x402 is enabled
router.get('/x402/status', (_req, res) => {
    res.json({
        enabled: isX402Enabled(),
        message: isX402Enabled()
            ? 'x402 payments enabled (using Circle wallet)'
            : 'x402 disabled - configure CIRCLE_WALLET_ID and CIRCLE_ENTITY_SECRET'
    });
});

// Mock x402 demo endpoint - simulates a paid API
// Returns 402 on first request, then accepts payment and returns data
router.get('/x402/demo/paid-content', (req, res) => {
    const paymentHeader = req.headers['x-payment'];

    if (!paymentHeader) {
        // Return 402 Payment Required with payment requirements
        const paymentRequirements = {
            amount: '0.01',
            recipient: '0x03972eb60d23a16edf247a521b83153ceb70f9e9', // Your second wallet
            network: 'eip155:1620', // Arc testnet
            resource: '/api/payments/x402/demo/paid-content',
        };

        res.setHeader('x-payment-required', Buffer.from(JSON.stringify(paymentRequirements)).toString('base64'));
        return res.status(402).json({
            error: 'Payment Required',
            paymentRequirements,
            message: 'This endpoint requires a $0.01 USDC micropayment'
        });
    }

    // Payment received - return the "paid" content
    res.json({
        success: true,
        content: 'This is premium content that required an x402 micropayment!',
        paidAt: new Date().toISOString(),
        tip: 'Your AI agent just autonomously paid for API access using x402 + Circle!'
    });
});

export default router;
