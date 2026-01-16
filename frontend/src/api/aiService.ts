const AI_SERVICE_URL = 'http://localhost:3002';
const BACKEND_URL = 'http://localhost:3001';

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

export async function getBalance(): Promise<TreasuryBalance> {
    const response = await fetch(`${BACKEND_URL}/api/treasury/balance`);
    if (!response.ok) throw new Error('Failed to get balance');
    return response.json();
}

export async function getMessages(chatId: string): Promise<Message[]> {
    const response = await fetch(`${AI_SERVICE_URL}/api/chats/${chatId}/messages`);
    if (!response.ok) throw new Error('Failed to get messages');
    const data = await response.json();
    return data.messages;
}
