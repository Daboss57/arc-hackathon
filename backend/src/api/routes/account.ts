import { Router } from 'express';
import { deleteUserData } from '../../lib/dataStore.js';

const router = Router();

router.delete('/', async (req, res) => {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
        return res.status(400).json({ error: 'x-user-id header is required' });
    }
    try {
        await deleteUserData(userId);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

export default router;

