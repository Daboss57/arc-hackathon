import { Router } from 'express';
import { createPolicy, getPolicy, listPolicies, updatePolicy, deletePolicy, validatePayment } from '../../policy/engine.js';

const router = Router();

router.get('/', (_req, res) => {
    const policies = listPolicies();
    res.json({ policies });
});

router.post('/', (req, res) => {
    const { name, description, rules } = req.body;
    if (!name || !rules || !Array.isArray(rules)) {
        return res.status(400).json({ error: 'name and rules are required' });
    }
    const policy = createPolicy({ name, description, rules });
    res.status(201).json(policy);
});

router.get('/:id', (req, res) => {
    const policy = getPolicy(req.params.id);
    if (!policy) {
        return res.status(404).json({ error: 'Policy not found' });
    }
    res.json(policy);
});

router.put('/:id', (req, res) => {
    const { name, description, enabled, rules } = req.body;
    const policy = updatePolicy(req.params.id, { name, description, enabled, rules });
    if (!policy) {
        return res.status(404).json({ error: 'Policy not found' });
    }
    res.json(policy);
});

router.delete('/:id', (req, res) => {
    const deleted = deletePolicy(req.params.id);
    if (!deleted) {
        return res.status(404).json({ error: 'Policy not found' });
    }
    res.status(204).send();
});

router.post('/validate', async (req, res) => {
    const { amount, recipient, category, description } = req.body;
    if (!amount || !recipient) {
        return res.status(400).json({ error: 'amount and recipient are required' });
    }
    const result = await validatePayment({ amount, recipient, category, description });
    res.json(result);
});

export default router;
