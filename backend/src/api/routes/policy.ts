import { Router } from 'express';
import { createPolicy, getPolicy, listPolicies, updatePolicy, deletePolicy, validatePayment } from '../../policy/engine.js';

const router = Router();

router.get('/', (_req, res) => {
    const userId = _req.headers['x-user-id'] as string | undefined;
    if (!userId) {
        return res.status(400).json({ error: 'x-user-id header is required' });
    }
    const policies = listPolicies(userId);
    res.json({ policies });
});

router.post('/', (req, res) => {
    const { name, description, rules } = req.body;
    if (!name || !rules || !Array.isArray(rules)) {
        return res.status(400).json({ error: 'name and rules are required' });
    }
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
        return res.status(400).json({ error: 'x-user-id header is required' });
    }
    const policy = createPolicy({ name, description, rules: rules as any }, userId);
    res.status(201).json(policy);
});

router.get('/:id', (req, res) => {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
        return res.status(400).json({ error: 'x-user-id header is required' });
    }
    const policy = getPolicy(req.params.id, userId);
    if (!policy) {
        return res.status(404).json({ error: 'Policy not found' });
    }
    res.json(policy);
});

router.put('/:id', (req, res) => {
    const { name, description, enabled, rules } = req.body;
    const updates: { name?: string; description?: string; enabled?: boolean; rules?: unknown } = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (enabled !== undefined) updates.enabled = enabled;
    if (rules !== undefined) {
        if (!Array.isArray(rules)) {
            return res.status(400).json({ error: 'rules must be an array' });
        }
        updates.rules = rules;
    }
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
        return res.status(400).json({ error: 'x-user-id header is required' });
    }
    const policy = updatePolicy(req.params.id, updates as any, userId);
    if (!policy) {
        return res.status(404).json({ error: 'Policy not found' });
    }
    res.json(policy);
});

router.delete('/:id', (req, res) => {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
        return res.status(400).json({ error: 'x-user-id header is required' });
    }
    const deleted = deletePolicy(req.params.id, userId);
    if (!deleted) {
        return res.status(404).json({ error: 'Policy not found' });
    }
    res.status(204).send();
});

router.post('/validate', async (req, res) => {
    const { amount, recipient, category, description, metadata } = req.body;
    if (!amount || !recipient) {
        return res.status(400).json({ error: 'amount and recipient are required' });
    }
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
        return res.status(400).json({ error: 'x-user-id header is required' });
    }
    const mergedMetadata = userId ? { ...(metadata || {}), userId } : metadata;
    const result = await validatePayment({ amount, recipient, category, description, metadata: mergedMetadata });
    res.json(result);
});

export default router;
