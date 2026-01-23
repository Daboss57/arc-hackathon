export const AI_SERVICE_URL = 'http://localhost:3002';
export const BACKEND_URL = 'http://localhost:3001';

export interface Chat {
    id: string;
    user_id: string;
    title: string | null;
    system_prompt: string;
    model: string;
    created_at: string;
    updated_at: string;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    created_at: string;
    metadata?: {
        tool_calls?: Array<{ tool: string; args: unknown }>;
        executed_tools?: Array<{
            name: string;
            args: unknown;
            result: { ok: boolean; data?: unknown; error?: string };
        }>;
        sources?: Array<{ uri: string; title: string }>;
        thoughts?: string[];
    };
}

export interface TreasuryBalance {
    amount: string;
    currency: string;
    reserved: string;
    available: string;
    lastUpdated: string;
}

export type RuleType =
    | 'maxPerTransaction'
    | 'dailyLimit'
    | 'monthlyBudget'
    | 'vendorWhitelist'
    | 'categoryLimit';

export interface Rule {
    type: RuleType;
    params: Record<string, unknown>;
}

export interface Policy {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    rules: Rule[];
    createdAt: string;
    updatedAt: string;
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
    userId?: string;
    createdAt: string;
    confirmedAt?: string;
}

export interface X402FetchResult {
    success: boolean;
    data?: unknown;
    paymentMade?: boolean;
    paymentAmount?: string;
    txHash?: string;
    error?: string;
    policyBlocked?: boolean;
}

export interface VendorSummary {
    id: string;
    name: string;
    category: string;
    description: string;
    productCount: number;
}

export interface VendorProduct {
    id: string;
    name: string;
    description: string;
    price: string;
    stock: number;
}

export interface SafetyStatus {
    paymentsPaused: boolean;
    safeMode: boolean;
    approvalRequired: boolean;
    autoBudget: boolean;
}

function withUserId(userId?: string): Record<string, string> {
    return userId ? { 'x-user-id': userId } : {};
}

export async function createChat(userId: string, title?: string): Promise<Chat> {
    const response = await fetch(`${AI_SERVICE_URL}/api/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, title }),
    });
    if (!response.ok) throw new Error('Failed to create chat');
    return response.json();
}

export async function sendMessage(
    chatId: string,
    content: string
): Promise<{ message: Message; assistant_message: Message | null }> {
    const response = await fetch(`${AI_SERVICE_URL}/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, role: 'user', respond: true, use_tools: true }),
    });
    if (!response.ok) throw new Error('Failed to send message');
    return response.json();
}

export async function getBalance(force = false): Promise<TreasuryBalance> {
    const query = force ? '?force=true' : '';
    const response = await fetch(`${BACKEND_URL}/api/treasury/balance${query}`);
    if (!response.ok) throw new Error('Failed to get balance');
    return response.json();
}

export type StreamEvent =
    | { type: 'ack'; message: Message }
    | { type: 'delta'; text: string }
    | { type: 'done'; message: Message }
    | { type: 'error'; error: string };

export async function sendMessageStream(
    chatId: string,
    content: string
): Promise<AsyncGenerator<StreamEvent>> {
    const response = await fetch(`${AI_SERVICE_URL}/api/chats/${chatId}/messages/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, role: 'user', respond: true, use_tools: true }),
    });

    if (!response.ok || !response.body) {
        throw new Error('Failed to stream message');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    async function* stream() {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split('\n\n');
            buffer = chunks.pop() || '';

            for (const chunk of chunks) {
                const line = chunk.split('\n').find((l) => l.startsWith('data:'));
                if (!line) continue;
                const data = line.replace(/^data:\s?/, '');
                try {
                    const event = JSON.parse(data) as StreamEvent;
                    yield event;
                } catch {
                    // Ignore malformed events
                }
            }
        }
    }

    return stream();
}

export async function getMessages(chatId: string): Promise<Message[]> {
    const response = await fetch(`${AI_SERVICE_URL}/api/chats/${chatId}/messages`);
    if (!response.ok) throw new Error('Failed to get messages');
    const data = await response.json();
    return data.messages;
}

export async function listVendors(): Promise<VendorSummary[]> {
    const response = await fetch(`${BACKEND_URL}/api/vendors`);
    if (!response.ok) throw new Error('Failed to load vendors');
    const data = await response.json();
    return data.vendors as VendorSummary[];
}

export async function listVendorProducts(vendorId: string): Promise<{ vendorName: string; products: VendorProduct[] }> {
    const response = await fetch(`${BACKEND_URL}/api/vendors/${vendorId}/products`);
    if (!response.ok) throw new Error('Failed to load vendor products');
    return response.json();
}

export async function listPolicies(): Promise<Policy[]> {
    const response = await fetch(`${BACKEND_URL}/api/policy`);
    if (!response.ok) throw new Error('Failed to load policies');
    const data = await response.json();
    return data.policies as Policy[];
}

export async function createPolicy(payload: {
    name: string;
    description?: string;
    rules: Rule[];
}): Promise<Policy> {
    const response = await fetch(`${BACKEND_URL}/api/policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to create policy');
    return response.json();
}

export async function updatePolicy(policyId: string, updates: Partial<Pick<Policy, 'name' | 'description' | 'enabled' | 'rules'>>): Promise<Policy> {
    const response = await fetch(`${BACKEND_URL}/api/policy/${policyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error('Failed to update policy');
    return response.json();
}

export async function getSpendingAnalytics(userId?: string): Promise<SpendingAnalytics> {
    const response = await fetch(`${BACKEND_URL}/api/treasury/analytics`, {
        headers: withUserId(userId),
    });
    if (!response.ok) throw new Error('Failed to load analytics');
    return response.json();
}

export async function getTransactionHistory(params: { limit?: number; offset?: number } = {}, userId?: string): Promise<Transaction[]> {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.offset) query.set('offset', params.offset.toString());
    const response = await fetch(`${BACKEND_URL}/api/treasury/history?${query.toString()}`, {
        headers: withUserId(userId),
    });
    if (!response.ok) throw new Error('Failed to load transactions');
    const data = await response.json();
    return data.transactions as Transaction[];
}

export async function x402Fetch(params: {
    url: string;
    method?: string;
    body?: object;
    headers?: Record<string, string>;
    category?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
}): Promise<X402FetchResult> {
    const response = await fetch(`${BACKEND_URL}/api/payments/x402/fetch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...withUserId(params.userId),
        },
        body: JSON.stringify({
            url: params.url,
            method: params.method || 'GET',
            body: params.body,
            headers: params.headers,
            category: params.category,
            metadata: params.metadata,
        }),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
            success: false,
            error: error?.error || 'x402 request failed',
            policyBlocked: error?.policyBlocked,
        };
    }
    return response.json();
}

export async function validatePayment(payload: {
    amount: string;
    recipient: string;
    category?: string;
    description?: string;
    metadata?: Record<string, unknown>;
}, userId?: string): Promise<{ approved: boolean; blockedBy?: string; results: Array<{ passed: boolean; policyName: string; reason?: string }> }> {
    const response = await fetch(`${BACKEND_URL}/api/policy/validate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...withUserId(userId),
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to validate payment');
    return response.json();
}

export async function getSafetyStatus(userId?: string): Promise<SafetyStatus> {
    const response = await fetch(`${BACKEND_URL}/api/treasury/safety`, {
        headers: withUserId(userId),
    });
    if (!response.ok) throw new Error('Failed to load safety status');
    return response.json();
}

export async function updateSafetyStatus(
    updates: Partial<SafetyStatus> & { resetApproval?: boolean },
    userId?: string
): Promise<SafetyStatus> {
    const response = await fetch(`${BACKEND_URL}/api/treasury/safety`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...withUserId(userId),
        },
        body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error('Failed to update safety status');
    return response.json();
}
