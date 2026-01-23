import { Router } from 'express';
import { getBalance, getTransactionHistory, initializeWallet, getWallet, getSpendingAnalytics } from '../../treasury/wallet.service.js';
import {
    getSafetySnapshot,
    resetUserApproval,
    setAutoBudgetEnabled,
    setPaymentsPaused,
    setSafeModeForUser,
} from '../../lib/safety.js';

const router = Router();

router.get('/balance', async (req, res) => {
    try {
        const force = String(req.query.force || '').toLowerCase() === 'true';
        const balance = await getBalance(force);
        res.json(balance);
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

router.get('/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const userId = req.headers['x-user-id'] as string | undefined;
        const history = await getTransactionHistory({ limit, offset }, userId);
        res.json({ transactions: history, limit, offset });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

router.get('/wallet', async (_req, res) => {
    try {
        let wallet = await getWallet();
        if (!wallet) {
            wallet = await initializeWallet();
        }
        res.json(wallet);
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

router.post('/wallet/init', async (_req, res) => {
    try {
        const wallet = await initializeWallet();
        res.json(wallet);
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

router.get('/analytics', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] as string | undefined;
        const analytics = await getSpendingAnalytics(userId);
        res.json(analytics);
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

router.get('/safety', (req, res) => {
    const userId = req.headers['x-user-id'] as string | undefined;
    const snapshot = getSafetySnapshot(userId);
    res.json(snapshot);
});

router.post('/safety', (req, res) => {
    const userId = req.headers['x-user-id'] as string | undefined;
    const { paymentsPaused, safeMode, resetApproval, autoBudget } = req.body || {};

    if (typeof paymentsPaused === 'boolean') {
        setPaymentsPaused(paymentsPaused);
    }

    if (userId && typeof safeMode === 'boolean') {
        setSafeModeForUser(userId, safeMode);
    }

    if (userId && typeof autoBudget === 'boolean') {
        setAutoBudgetEnabled(userId, autoBudget);
    }

    if (userId && resetApproval) {
        resetUserApproval(userId);
    }

    res.json(getSafetySnapshot(userId));
});

export default router;
