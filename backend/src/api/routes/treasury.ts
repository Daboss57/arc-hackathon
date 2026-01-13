import { Router } from 'express';
import { getBalance, getTransactionHistory, initializeWallet, getWallet } from '../../treasury/wallet.service.js';

const router = Router();

router.get('/balance', async (_req, res) => {
    try {
        const balance = await getBalance();
        res.json(balance);
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

router.get('/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const history = await getTransactionHistory({ limit, offset });
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

export default router;
