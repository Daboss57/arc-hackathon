import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './logger.js';
import { supabase } from './supabase.js';
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

const APP_STATE_ID = 'autowealth-global';
const SUPABASE_ENABLED = Boolean(supabase);
let loadedFromSupabase = false;

// Use process.cwd() for Vercel compatibility (no import.meta in CommonJS)
const projectRoot = process.cwd();
const legacyStorePath = path.resolve(projectRoot, 'backend', 'data', 'store.json');
const defaultStorePath = path.resolve(projectRoot, 'data', 'store.json');

function resolveStorePath(): string {
    if (config.DATA_STORE_PATH) {
        return path.resolve(config.DATA_STORE_PATH);
    }
    if (existsSync(defaultStorePath)) {
        return defaultStorePath;
    }
    if (existsSync(legacyStorePath)) {
        return legacyStorePath;
    }
    return defaultStorePath;
}

const STORE_PATH = resolveStorePath();

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

type PolicyRow = {
    id: string;
    user_id?: string | null;
    name: string;
    description?: string | null;
    enabled?: boolean | null;
    rules?: unknown;
    created_at?: string | null;
    updated_at?: string | null;
};

type TransactionRow = {
    id: string;
    user_id?: string | null;
    tx_hash?: string | null;
    from_address?: string | null;
    to_address?: string | null;
    amount?: string | null;
    currency?: string | null;
    status?: string | null;
    category?: string | null;
    description?: string | null;
    policy?: unknown;
    created_at?: string | null;
    confirmed_at?: string | null;
};

type SafetyRow = {
    user_id: string;
    safe_mode?: boolean | null;
    approved_once?: boolean | null;
    auto_budget?: boolean | null;
    updated_at?: string | null;
};

type AppStateRow = {
    id: string;
    payments_paused?: boolean | null;
    updated_at?: string | null;
};

function mapPolicyRow(row: PolicyRow): Policy {
    return {
        id: row.id,
        userId: row.user_id ?? undefined,
        name: row.name || 'Untitled Policy',
        description: row.description ?? undefined,
        enabled: row.enabled ?? true,
        rules: Array.isArray(row.rules) ? (row.rules as Policy['rules']) : [],
        createdAt: new Date(row.created_at || Date.now()),
        updatedAt: new Date(row.updated_at || row.created_at || Date.now()),
    };
}

function mapTransactionRow(row: TransactionRow): Transaction {
    return {
        id: row.id,
        userId: row.user_id ?? undefined,
        txHash: row.tx_hash ?? '',
        from: row.from_address ?? '',
        to: row.to_address ?? '',
        amount: row.amount ?? '0.00',
        currency: (row.currency as Transaction['currency']) || 'USDC',
        status: (row.status as Transaction['status']) || 'pending',
        category: row.category ?? undefined,
        description: row.description ?? undefined,
        policy: row.policy ? (row.policy as Transaction['policy']) : undefined,
        createdAt: new Date(row.created_at || Date.now()),
        confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
    };
}

function policyToRow(policy: Policy): PolicyRow {
    return {
        id: policy.id,
        user_id: policy.userId ?? null,
        name: policy.name,
        description: policy.description ?? null,
        enabled: policy.enabled,
        rules: policy.rules,
        created_at: policy.createdAt.toISOString(),
        updated_at: policy.updatedAt.toISOString(),
    };
}

function transactionToRow(tx: Transaction): TransactionRow {
    return {
        id: tx.id,
        user_id: tx.userId ?? null,
        tx_hash: tx.txHash,
        from_address: tx.from,
        to_address: tx.to,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        category: tx.category ?? null,
        description: tx.description ?? null,
        policy: tx.policy ?? null,
        created_at: tx.createdAt.toISOString(),
        confirmed_at: tx.confirmedAt ? tx.confirmedAt.toISOString() : null,
    };
}

async function loadStateFromSupabase(): Promise<PersistedState | null> {
    if (!SUPABASE_ENABLED || !supabase) return null;
    try {
        const [appStateRes, policyRes, transactionRes, safetyRes] = await Promise.all([
            supabase.from('app_state').select('*').eq('id', APP_STATE_ID).maybeSingle(),
            supabase.from('policies').select('*'),
            supabase.from('transactions').select('*'),
            supabase.from('safety_state').select('*'),
        ]);

        if (appStateRes.error || policyRes.error || transactionRes.error || safetyRes.error) {
            throw new Error(
                [
                    appStateRes.error?.message,
                    policyRes.error?.message,
                    transactionRes.error?.message,
                    safetyRes.error?.message,
                ]
                    .filter(Boolean)
                    .join(' | ')
            );
        }

        const appState = appStateRes.data as AppStateRow | null;
        const paymentsPaused = appState?.payments_paused ?? false;

        const policies = (policyRes.data as PolicyRow[] | null | undefined)?.map(mapPolicyRow) ?? [];
        const transactions = (transactionRes.data as TransactionRow[] | null | undefined)?.map(mapTransactionRow) ?? [];

        const safety: SafetyState = {
            paymentsPaused,
            safeModeByUser: {},
            approvedSpendByUser: {},
            autoBudgetByUser: {},
        };

        const safetyRows = (safetyRes.data as SafetyRow[] | null | undefined) ?? [];
        for (const row of safetyRows) {
            safety.safeModeByUser[row.user_id] = row.safe_mode ?? false;
            safety.approvedSpendByUser[row.user_id] = row.approved_once ?? false;
            safety.autoBudgetByUser[row.user_id] = row.auto_budget ?? false;
        }

        return {
            policies,
            transactions,
            safety,
        };
    } catch (err) {
        logger.warn('Failed to load state from Supabase', { error: String(err) });
        return null;
    }
}

async function persistStateToSupabase(): Promise<void> {
    if (!SUPABASE_ENABLED || !supabase) return;

    const now = new Date().toISOString();
    const appStatePayload: AppStateRow = {
        id: APP_STATE_ID,
        payments_paused: state.safety.paymentsPaused,
        updated_at: now,
    };

    const safetyUserIds = new Set<string>([
        ...Object.keys(state.safety.safeModeByUser),
        ...Object.keys(state.safety.approvedSpendByUser),
        ...Object.keys(state.safety.autoBudgetByUser),
    ]);
    const safetyRows: SafetyRow[] = Array.from(safetyUserIds).map(userId => ({
        user_id: userId,
        safe_mode: state.safety.safeModeByUser[userId] ?? false,
        approved_once: state.safety.approvedSpendByUser[userId] ?? false,
        auto_budget: state.safety.autoBudgetByUser[userId] ?? false,
        updated_at: now,
    }));

    const policyRows = state.policies.map(policyToRow);
    const transactionRows = state.transactions.map(transactionToRow);

    try {
        const appStateResult = await supabase
            .from('app_state')
            .upsert(appStatePayload, { onConflict: 'id' });
        if (appStateResult.error) throw appStateResult.error;

        if (policyRows.length > 0) {
            const policyResult = await supabase
                .from('policies')
                .upsert(policyRows, { onConflict: 'id' });
            if (policyResult.error) throw policyResult.error;
        }
        if (loadedFromSupabase) {
            if (policyRows.length === 0) {
                const policyDelete = await supabase.from('policies').delete().neq('id', '');
                if (policyDelete.error) throw policyDelete.error;
            } else {
                const ids = policyRows.map(row => `"${row.id}"`).join(',');
                const policyDelete = await supabase
                    .from('policies')
                    .delete()
                    .not('id', 'in', `(${ids})`);
                if (policyDelete.error) throw policyDelete.error;
            }
        }

        if (transactionRows.length > 0) {
            const txResult = await supabase
                .from('transactions')
                .upsert(transactionRows, { onConflict: 'id' });
            if (txResult.error) throw txResult.error;
        }

        if (safetyRows.length > 0) {
            const safetyResult = await supabase
                .from('safety_state')
                .upsert(safetyRows, { onConflict: 'user_id' });
            if (safetyResult.error) throw safetyResult.error;
        }

        loadedFromSupabase = true;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('Failed to persist state to Supabase', { error: message });
    }
}

export async function initDataStore(): Promise<void> {
    if (loaded) return;
    loaded = true;

    if (config.NODE_ENV === 'test' || process.env.NODE_ENV === 'test') {
        state = {
            policies: [],
            transactions: [],
            safety: { ...DEFAULT_STATE.safety },
        };
        return;
    }

    if (SUPABASE_ENABLED) {
        const supabaseState = await loadStateFromSupabase();
        if (supabaseState) {
            const hasSafety =
                supabaseState.safety.paymentsPaused ||
                Object.keys(supabaseState.safety.safeModeByUser).length > 0 ||
                Object.keys(supabaseState.safety.approvedSpendByUser).length > 0 ||
                Object.keys(supabaseState.safety.autoBudgetByUser).length > 0;
            const hasData =
                supabaseState.policies.length > 0 ||
                supabaseState.transactions.length > 0 ||
                hasSafety;
            if (hasData) {
                state = supabaseState;
                loadedFromSupabase = true;
                logger.info('Loaded state from Supabase', {
                    policies: state.policies.length,
                    transactions: state.transactions.length,
                });
                return;
            }
        }
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
        if (
            STORE_PATH === defaultStorePath &&
            state.policies.length === 0 &&
            state.transactions.length === 0 &&
            existsSync(legacyStorePath)
        ) {
            try {
                const legacyRaw = await fs.readFile(legacyStorePath, 'utf-8');
                const legacyParsed = JSON.parse(legacyRaw) as PersistedState;
                const legacyPolicies = (legacyParsed.policies || []).map(hydratePolicy);
                const legacyTransactions = (legacyParsed.transactions || []).map(hydrateTransaction);
                if (legacyPolicies.length > 0 || legacyTransactions.length > 0) {
                    state = {
                        policies: legacyPolicies,
                        transactions: legacyTransactions,
                        safety: {
                            paymentsPaused: legacyParsed.safety?.paymentsPaused ?? false,
                            safeModeByUser: legacyParsed.safety?.safeModeByUser ?? {},
                            approvedSpendByUser: legacyParsed.safety?.approvedSpendByUser ?? {},
                            autoBudgetByUser: legacyParsed.safety?.autoBudgetByUser ?? {},
                        },
                    };
                    await persistState();
                }
            } catch {
                // ignore legacy migration failures
            }
        }
        logger.info('Loaded persisted state', {
            policies: state.policies.length,
            transactions: state.transactions.length,
        });
    } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'ENOENT') {
            // Migrate legacy store if present
            try {
                const legacyRaw = await fs.readFile(legacyStorePath, 'utf-8');
                const legacyParsed = JSON.parse(legacyRaw) as PersistedState;
                state = {
                    policies: (legacyParsed.policies || []).map(hydratePolicy),
                    transactions: (legacyParsed.transactions || []).map(hydrateTransaction),
                    safety: {
                        paymentsPaused: legacyParsed.safety?.paymentsPaused ?? false,
                        safeModeByUser: legacyParsed.safety?.safeModeByUser ?? {},
                        approvedSpendByUser: legacyParsed.safety?.approvedSpendByUser ?? {},
                        autoBudgetByUser: legacyParsed.safety?.autoBudgetByUser ?? {},
                    },
                };
                await persistState();
                return;
            } catch {
                await persistState();
                return;
            }
        }
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('Failed to load persisted state', { error: message });
    }
}

async function persistState(): Promise<void> {
    if (config.NODE_ENV === 'test' || process.env.NODE_ENV === 'test') return;
    if (SUPABASE_ENABLED) {
        await persistStateToSupabase();
        return;
    }
    try {
        await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
        await fs.writeFile(STORE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('Failed to persist state', { error: message });
    }
}

export function getPolicies(userId?: string): Policy[] {
    if (!userId) return state.policies;
    return state.policies.filter(policy => policy.userId === userId);
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

export async function deleteUserData(userId: string): Promise<void> {
    state.policies = state.policies.filter(policy => policy.userId !== userId);
    state.transactions = state.transactions.filter(tx => tx.userId !== userId);
    delete state.safety.safeModeByUser[userId];
    delete state.safety.approvedSpendByUser[userId];
    delete state.safety.autoBudgetByUser[userId];

    if (SUPABASE_ENABLED && supabase) {
        try {
            const [policyResult, txResult, safetyResult] = await Promise.all([
                supabase.from('policies').delete().eq('user_id', userId),
                supabase.from('transactions').delete().eq('user_id', userId),
                supabase.from('safety_state').delete().eq('user_id', userId),
            ]);

            if (policyResult.error || txResult.error || safetyResult.error) {
                throw new Error(
                    [
                        policyResult.error?.message,
                        txResult.error?.message,
                        safetyResult.error?.message,
                    ]
                        .filter(Boolean)
                        .join(' | ')
                );
            }
        } catch (err) {
            logger.warn('Failed to delete user data from Supabase', { error: String(err) });
        }
        return;
    }

    await persistState();
}
