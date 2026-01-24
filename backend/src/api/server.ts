import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { initializeWallet, hydrateTransactionsFromStore } from '../treasury/wallet.service.js';
import { seedDefaultPolicies, loadPoliciesFromStore } from '../policy/engine.js';
import { initDataStore } from '../lib/dataStore.js';
import treasuryRoutes from './routes/treasury.js';
import policyRoutes from './routes/policy.js';
import paymentRoutes from './routes/payments.js';
import vendorRoutes from './routes/vendors.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/treasury', treasuryRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/vendors', vendorRoutes);

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (config.SERVE_FRONTEND) {
    const distPath = config.FRONTEND_DIST
        ? path.resolve(config.FRONTEND_DIST)
        : path.resolve(__dirname, '../../..', 'frontend', 'dist');
    if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
                return next();
            }
            res.sendFile(path.join(distPath, 'index.html'));
        });
    } else {
        logger.warn('Frontend dist not found; skipping static hosting', { distPath });
    }
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
});

async function start() {
    logger.info('Initializing services...');

    await initDataStore();
    loadPoliciesFromStore();
    hydrateTransactionsFromStore();

    await initializeWallet();
    seedDefaultPolicies();

    app.listen(config.PORT, () => {
        logger.info(`Server running on port ${config.PORT}`);
        logger.info(`Health check: http://localhost:${config.PORT}/health`);
    });
}

// Export app for Vercel
export default app;

if (process.env.NODE_ENV !== 'test') {
    // Only start server if run directly (not imported by Vercel)
    const isVercel = process.env.VERCEL === '1';
    if (!isVercel) {
        start().catch(err => {
            logger.error('Failed to start server', { error: String(err) });
            process.exit(1);
        });
    }
}
