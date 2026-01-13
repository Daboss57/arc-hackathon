import express from 'express';
import cors from 'cors';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { initializeWallet } from '../treasury/wallet.service.js';
import { seedDefaultPolicies } from '../policy/engine.js';
import treasuryRoutes from './routes/treasury.js';
import policyRoutes from './routes/policy.js';
import paymentRoutes from './routes/payments.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/treasury', treasuryRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/payments', paymentRoutes);

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
});

async function start() {
    logger.info('Initializing services...');

    await initializeWallet();
    seedDefaultPolicies();

    app.listen(config.PORT, () => {
        logger.info(`Server running on port ${config.PORT}`);
        logger.info(`Health check: http://localhost:${config.PORT}/health`);
    });
}

start().catch(err => {
    logger.error('Failed to start server', { error: String(err) });
    process.exit(1);
});
