export interface WalletInfo {
    id: string;
    address: string;
    blockchain: string;
    state: 'LIVE' | 'PENDING' | 'FROZEN';
    createdAt: Date;
}

export interface Balance {
    amount: string;
    currency: 'USDC';
    reserved: string;
    available: string;
    lastUpdated: Date;
}

export interface Transaction {
    id: string;
    txHash: string;
    from: string;
    to: string;
    amount: string;
    currency: 'USDC';
    status: 'pending' | 'confirmed' | 'failed';
    category?: string;
    description?: string;
    policy?: {
        approved: boolean;
        appliedPolicies: string[];
        blockedBy?: string;
    };
    userId?: string;  // Track which user owns this transaction
    createdAt: Date;
    confirmedAt?: Date;
}

export interface TransactionHistoryQuery {
    limit?: number;
    offset?: number;
    status?: Transaction['status'];
    startDate?: Date;
    endDate?: Date;
}
