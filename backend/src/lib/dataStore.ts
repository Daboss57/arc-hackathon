import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './logger.js';
import type { Policy } from '../policy/types.js';
import type { Transaction } from '../treasury/types.js';

export interface SafetyState {
    paymentsPaused: boolean;
    safeModeByUser: Record<string, boolean>;
    approvedSpendByUser: Record<string, boolean>;
    autoBudgetByUser: Record<string, boolean>;
}

interface PersistedState {
    policies: Policy[];
    transactions: Transaction[];
    safety: SafetyState;
}

const DEFAULT_STATE: PersistedState = {
    policies: [],
    transactions: [],
    safety: {
        paymentsPaused: false,
        safeModeByUser: {},
        approvedSpendByUser: {},
        autoBudgetByUser: {},
    },
};

const STORE_PATH = config.DATA_STORE_PATH
    ? path.resolve(config.DATA_STORE_PATH)
    : path.resolve(process.cwd(), 'data', 'store.json');

let state: PersistedState = {
    policies: [],
    transactions: [],
    safety: { ...DEFAULT_STATE.safety },
};
let loaded = false;

function hydratePolicy(raw: Policy): Policy {
    return {
        ...raw,
        createdAt: new Date(raw.createdAt),
        updatedAt: new Date(raw.updatedAt),
    };
}

function hydrateTransaction(raw: Transaction): Transaction {
    return {
        ...raw,
        createdAt: new Date(raw.createdAt),
        confirmedAt: raw.confirmedAt ? new Date(raw.confirmedAt) : undefined,
    };
}

export async function initDataStore(): Promise<void> {
    if (loaded) return;
    loaded = true;

    if (config.NODE_ENV === 'test') {
        state = {
            policies: [],
            transactions: [],
            safety: { ...DEFAULT_STATE.safety },
        };
        return;
    }

    try {
        const raw = await fs.readFile(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as PersistedState;
        state = {
            policies: (parsed.policies || []).map(hydratePolicy),
            transactions: (parsed.transactions || []).map(hydrateTransaction),
            safety: {
                paymentsPaused: parsed.safety?.paymentsPaused ?? false,
                safeModeByUser: parsed.safety?.safeModeByUser ?? {},
                approvedSpendByUser: parsed.safety?.approvedSpendByUser ?? {},
                autoBudgetByUser: parsed.safety?.autoBudgetByUser ?? {},
            },
        };
        logger.info('Loaded persisted state', {
            policies: state.policies.length,
            transactions: state.transactions.length,
        });
    } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'ENOENT') {
            await persistState();
            return;
        }
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('Failed to load persisted state', { error: message });
    }
}

async function persistState(): Promise<void> {
    if (config.NODE_ENV === 'test') return;
    try {
        await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
        await fs.writeFile(STORE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('Failed to persist state', { error: message });
    }
}

export function getPolicies(): Policy[] {
    return state.policies;
}

export function setPolicies(policies: Policy[]): void {
    state.policies = policies;
    void persistState();
}

export function getTransactions(): Transaction[] {
    return state.transactions;
}

export function setTransactions(transactions: Transaction[]): void {
    state.transactions = transactions;
    void persistState();
}

export function getSafetyState(): SafetyState {
    return state.safety;
}

export function setSafetyState(next: SafetyState): void {
    state.safety = next;
    void persistState();
}
