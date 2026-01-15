import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import type { WalletInfo, Balance, Transaction, TransactionHistoryQuery } from './types.js';

let circleClient: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

function getCircleClient() {
    if (!circleClient) {
        if (!config.CIRCLE_ENTITY_SECRET) {
            throw new Error('CIRCLE_ENTITY_SECRET is required for Circle SDK');
        }
        circleClient = initiateDeveloperControlledWalletsClient({
            apiKey: config.CIRCLE_API_KEY,
            entitySecret: config.CIRCLE_ENTITY_SECRET,
        });
    }
    return circleClient;
}

interface WalletStore {
    wallet: WalletInfo | null;
    transactions: Transaction[];
    balance: Balance;
}

const store: WalletStore = {
    wallet: null,
    transactions: [],
    balance: {
        amount: '0.00',
        currency: 'USDC',
        reserved: '0.00',
        available: '0.00',
        lastUpdated: new Date(),
    },
};

export async function initializeWallet(): Promise<WalletInfo> {
    if (store.wallet) {
        return store.wallet;
    }

    const walletId = config.CIRCLE_WALLET_ID;

    if (walletId) {
        logger.info('Fetching existing wallet from Circle', { walletId });

        try {
            const client = getCircleClient();
            const response = await client.getWallet({ id: walletId });

            if (response.data?.wallet) {
                const w = response.data.wallet;
                store.wallet = {
                    id: w.id,
                    address: w.address || '0x0',
                    blockchain: w.blockchain || 'ARC-TESTNET',
                    state: w.state as 'LIVE' | 'PENDING' | 'FROZEN',
                    createdAt: new Date(w.createDate || Date.now()),
                };

                logger.info('Wallet loaded from Circle', {
                    walletId: store.wallet.id,
                    address: store.wallet.address,
                    blockchain: store.wallet.blockchain
                });

                await refreshBalance();
                return store.wallet;
            }
        } catch (err) {
            logger.error('Failed to fetch wallet from Circle', { error: String(err) });
        }
    }

    logger.warn('Using mock wallet - no CIRCLE_WALLET_ID configured');
    store.wallet = {
        id: 'wallet_mock_001',
        address: '0x0000000000000000000000000000000000000000',
        blockchain: 'ARC-TESTNET',
        state: 'LIVE',
        createdAt: new Date(),
    };
    store.balance = {
        amount: '100.00',
        currency: 'USDC',
        reserved: '0.00',
        available: '100.00',
        lastUpdated: new Date(),
    };

    return store.wallet;
}

export async function getWallet(): Promise<WalletInfo | null> {
    return store.wallet;
}

async function refreshBalance(): Promise<void> {
    if (!store.wallet || !config.CIRCLE_WALLET_ID) return;

    try {
        const client = getCircleClient();
        const response = await client.getWalletTokenBalance({
            id: config.CIRCLE_WALLET_ID,
        });

        const balances = response.data?.tokenBalances || [];
        const usdcBalance = balances.find(b =>
            b.token?.symbol === 'USDC' || b.token?.name?.includes('USDC')
        );

        const amount = usdcBalance?.amount || '0';
        store.balance = {
            amount,
            currency: 'USDC',
            reserved: store.balance.reserved,
            available: (parseFloat(amount) - parseFloat(store.balance.reserved)).toFixed(2),
            lastUpdated: new Date(),
        };

        logger.info('Balance refreshed from Circle', { amount });
    } catch (err) {
        logger.error('Failed to refresh balance', { error: String(err) });
    }
}

export async function getBalance(): Promise<Balance> {
    if (config.CIRCLE_WALLET_ID && Date.now() - store.balance.lastUpdated.getTime() > 10000) {
        await refreshBalance();
    }
    return store.balance;
}

export async function reserveFunds(amount: string): Promise<boolean> {
    const available = parseFloat(store.balance.available);
    const toReserve = parseFloat(amount);

    if (toReserve > available) {
        logger.warn('Insufficient funds for reservation', {
            requested: amount,
            available: store.balance.available
        });
        return false;
    }

    store.balance.reserved = (parseFloat(store.balance.reserved) + toReserve).toFixed(2);
    store.balance.available = (available - toReserve).toFixed(2);
    store.balance.lastUpdated = new Date();

    logger.info('Funds reserved', { amount, newAvailable: store.balance.available });
    return true;
}

export async function releaseFunds(amount: string): Promise<void> {
    const reserved = parseFloat(store.balance.reserved);
    const toRelease = Math.min(parseFloat(amount), reserved);

    store.balance.reserved = (reserved - toRelease).toFixed(2);
    store.balance.available = (parseFloat(store.balance.available) + toRelease).toFixed(2);
    store.balance.lastUpdated = new Date();
}

export interface TransferResult {
    success: boolean;
    transactionId?: string;
    txHash?: string;
    state?: string;
    error?: string;
}

let cachedTokenId: string | null = null;

async function getUsdcTokenId(): Promise<string | null> {
    if (cachedTokenId) return cachedTokenId;
    if (!config.CIRCLE_WALLET_ID) return null;

    try {
        const client = getCircleClient();
        const response = await client.getWalletTokenBalance({ id: config.CIRCLE_WALLET_ID });
        const balances = response.data?.tokenBalances || [];
        const usdc = balances.find(b => b.token?.symbol === 'USDC' || b.token?.name?.includes('USDC'));
        if (usdc?.token?.id) {
            cachedTokenId = usdc.token.id;
            return cachedTokenId;
        }
    } catch (err) {
        logger.error('Failed to get USDC token ID', { error: String(err) });
    }
    return null;
}

export async function transferUsdc(
    destinationAddress: string,
    amount: string
): Promise<TransferResult> {
    if (!config.CIRCLE_WALLET_ID) {
        return { success: false, error: 'Wallet not configured' };
    }

    const tokenId = await getUsdcTokenId();
    if (!tokenId) {
        return { success: false, error: 'Could not find USDC token in wallet' };
    }

    try {
        const client = getCircleClient();
        const { v4: uuidv4 } = await import('uuid');

        logger.info('Initiating USDC transfer via Circle SDK', {
            destination: destinationAddress,
            amount,
            tokenId
        });

        const response = await client.createTransaction({
            idempotencyKey: uuidv4(),
            walletId: config.CIRCLE_WALLET_ID!,
            tokenId,
            destinationAddress,
            amount: [amount],
            fee: {
                type: 'level',
                config: { feeLevel: 'MEDIUM' },
            },
        });

        // SDK returns the transaction directly in data, not nested under 'transaction'
        const tx = response.data as { id?: string; state?: string; txHash?: string } | undefined;

        logger.info('Circle SDK response', {
            id: tx?.id,
            state: tx?.state,
            txHash: tx?.txHash
        });

        if (!tx?.id) {
            logger.error('No transaction ID in response', { fullData: JSON.stringify(response.data) });
            return { success: false, error: 'No transaction returned from Circle' };
        }

        logger.info('Transfer initiated successfully', {
            transactionId: tx.id,
            state: tx.state,
            txHash: tx.txHash
        });

        setTimeout(() => refreshBalance(), 2000);

        return {
            success: true,
            transactionId: tx.id,
            txHash: tx.txHash || undefined,
            state: tx.state,
        };
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Transfer failed', { error: errorMessage });
        return { success: false, error: errorMessage };
    }
}

export async function recordTransaction(tx: Omit<Transaction, 'id' | 'createdAt'>): Promise<Transaction> {
    const transaction: Transaction = {
        ...tx,
        id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date(),
    };

    store.transactions.unshift(transaction);
    return transaction;
}

export async function getTransactionHistory(query: TransactionHistoryQuery = {}): Promise<Transaction[]> {
    const { limit = 50, offset = 0, status } = query;

    let filtered = store.transactions;
    if (status) {
        filtered = filtered.filter(tx => tx.status === status);
    }

    return filtered.slice(offset, offset + limit);
}

export async function updateTransactionStatus(
    txId: string,
    status: Transaction['status'],
    txHash?: string
): Promise<Transaction | null> {
    const tx = store.transactions.find(t => t.id === txId);
    if (!tx) return null;

    tx.status = status;
    if (txHash) tx.txHash = txHash;
    if (status === 'confirmed') tx.confirmedAt = new Date();

    return tx;
}

export interface SpendingAnalytics {
    daily: {
        spent: number;
        limit: number;
        percentUsed: number;
        remaining: number;
    };
    monthly: {
        spent: number;
        budget: number;
        percentUsed: number;
        remaining: number;
    };
    byCategory: Record<string, number>;
    recentTransactions: number;
    warning?: string;
}

export async function getSpendingAnalytics(): Promise<SpendingAnalytics> {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const confirmedTxs = store.transactions.filter(tx => tx.status === 'confirmed');

    const dailySpend = confirmedTxs
        .filter(tx => tx.createdAt >= dayStart)
        .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

    const monthlySpend = confirmedTxs
        .filter(tx => tx.createdAt >= monthStart)
        .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

    const byCategory: Record<string, number> = {};
    for (const tx of confirmedTxs.filter(t => t.createdAt >= monthStart)) {
        const cat = tx.category || 'uncategorized';
        byCategory[cat] = (byCategory[cat] || 0) + parseFloat(tx.amount);
    }

    // Default limits from policy
    const dailyLimit = 50;
    const monthlyBudget = 200;

    const dailyPercent = (dailySpend / dailyLimit) * 100;
    const monthlyPercent = (monthlySpend / monthlyBudget) * 100;

    let warning: string | undefined;
    if (dailyPercent >= 80) {
        warning = `Warning: ${dailyPercent.toFixed(0)}% of daily limit used`;
    } else if (monthlyPercent >= 80) {
        warning = `Warning: ${monthlyPercent.toFixed(0)}% of monthly budget used`;
    }

    return {
        daily: {
            spent: parseFloat(dailySpend.toFixed(2)),
            limit: dailyLimit,
            percentUsed: parseFloat(dailyPercent.toFixed(1)),
            remaining: parseFloat((dailyLimit - dailySpend).toFixed(2)),
        },
        monthly: {
            spent: parseFloat(monthlySpend.toFixed(2)),
            budget: monthlyBudget,
            percentUsed: parseFloat(monthlyPercent.toFixed(1)),
            remaining: parseFloat((monthlyBudget - monthlySpend).toFixed(2)),
        },
        byCategory,
        recentTransactions: confirmedTxs.length,
        warning,
    };
}
export function resetStoreForTesting() {
    circleClient = null;
    cachedTokenId = null;
    store.wallet = null;
    store.transactions = [];
    store.balance = {
        amount: '0.00',
        currency: 'USDC',
        reserved: '0.00',
        available: '0.00',
        lastUpdated: new Date(0), // Set to epoch to force refresh
    };
}
