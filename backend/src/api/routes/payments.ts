import { Router } from 'express';
import { executePayment } from '../../payments/executor.js';

const router = Router();

router.post('/execute', async (req, res) => {
    const { recipient, amount, category, description, metadata } = req.body;

    if (!recipient || !amount) {
        return res.status(400).json({ error: 'recipient and amount are required' });
    }

    const result = await executePayment({ recipient, amount, category, description, metadata });

    if (result.status === 'failed') {
        return res.status(400).json(result);
    }

    res.json(result);
});

export default router;
