import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import type { WalletInfo, Balance, Transaction, TransactionHistoryQuery } from './types.js';

// In production, this would use Circle's SDK:
// import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

interface WalletStore {
    wallet: WalletInfo | null;
    transactions: Transaction[];
    balance: Balance;
}

const store: WalletStore = {
    wallet: null,
    transactions: [],
    balance: {
        amount: '100.00',
        currency: 'USDC',
        reserved: '0.00',
        available: '100.00',
        lastUpdated: new Date(),
    },
};

export async function initializeWallet(): Promise<WalletInfo> {
    if (store.wallet) {
        return store.wallet;
    }

    logger.info('Initializing wallet via Circle SDK');

    // Mock wallet for development - replace with Circle SDK call
    // const client = initiateDeveloperControlledWalletsClient({ apiKey: config.CIRCLE_API_KEY });
    // const response = await client.createWallets({ blockchains: ['ARC'], count: 1 });

    store.wallet = {
        id: 'wallet_mock_001',
        address: '0x' + '0'.repeat(40),
        blockchain: 'ARC',
        state: 'LIVE',
        createdAt: new Date(),
    };

    logger.info('Wallet initialized', { walletId: store.wallet.id });
    return store.wallet;
}

export async function getWallet(): Promise<WalletInfo | null> {
    return store.wallet;
}

export async function getBalance(): Promise<Balance> {
    // In production, fetch from Circle API
    store.balance.lastUpdated = new Date();
    return store.balance;
}

export async function reserveFunds(amount: string): Promise<boolean> {
    const available = parseFloat(store.balance.available);
    const toReserve = parseFloat(amount);

    if (toReserve > available) {
        logger.warn('Insufficient funds for reservation', { requested: amount, available: store.balance.available });
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
