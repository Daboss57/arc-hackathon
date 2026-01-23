import { useCallback, useEffect, useRef, useState } from 'react';
import { createChat, getMessages, listChats, sendMessageStream, type Chat, type Message } from '../api/aiService';
import { BalanceDisplay } from './BalanceDisplay';
import { MessageInput } from './MessageInput';
import { MessageList } from './MessageList';
import { QuickActions } from './QuickActions';
import { AdvisorPanel } from './AdvisorPanel';
import { AnalyticsPanel } from './AnalyticsPanel';
import { PolicyCockpit } from './PolicyCockpit';
import { ReceiptsPanel } from './ReceiptsPanel';
import { X402DemoPanel } from './X402DemoPanel';
import { SafetyControlsPanel } from './SafetyControlsPanel';
import { PolicySimulationPanel } from './PolicySimulationPanel';
import { VendorComparisonPanel } from './VendorComparisonPanel';
import { MarketplacePanel } from './MarketplacePanel';
import { ChatList } from './ChatList';

interface ChatWindowProps {
    userId: string;
    defaultMonthlyBudget?: number | null;
}

export function ChatWindow({ userId, defaultMonthlyBudget }: ChatWindowProps) {
    const [chatId, setChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [chats, setChats] = useState<Chat[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initialize chats on mount
    useEffect(() => {
        const initChat = async () => {
            try {
                const list = await listChats(userId);
                const sorted = [...list].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
                setChats(sorted);

                const lastChatId = localStorage.getItem(`autowealth-active-chat:${userId}`);
                const match = list.find((item) => item.id === lastChatId);
                if (match) {
                    setChatId(match.id);
                } else if (list.length > 0) {
                    setChatId(list[0].id);
                } else {
                    const chat = await createChat(userId);
                    setChatId(chat.id);
                    setChats([chat]);
                }
            } catch (err) {
                setError('Failed to initialize chat. Make sure the AI service is running on port 3002.');
                console.error(err);
            }
        };
        initChat();
    }, [userId]);

    useEffect(() => {
        const loadMessages = async () => {
            if (!chatId) return;
            try {
                const history = await getMessages(chatId);
                setMessages(history);
                localStorage.setItem(`autowealth-active-chat:${userId}`, chatId);
                setError(null);
            } catch (err) {
                setError('Failed to load chat history.');
                console.error(err);
            }
        };
        loadMessages();
    }, [chatId, userId]);

    const handleCreateChat = useCallback(async () => {
        try {
            const chat = await createChat(userId);
            setChats((prev) => [chat, ...prev]);
            setChatId(chat.id);
        } catch (err) {
            setError('Failed to create chat.');
        }
    }, [userId]);

    const refreshChatList = useCallback(async () => {
        try {
            const list = await listChats(userId);
            const sorted = [...list].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
            setChats(sorted);
        } catch (err) {
            // Ignore list refresh errors
        }
    }, [userId]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = useCallback(async (content: string) => {
        if (!chatId || isLoading) return;

        // Add user message immediately
        const tempUserMessage: Message = {
            id: `temp-${Date.now()}`,
            role: 'user',
            content,
            created_at: new Date().toISOString(),
        };
        const tempAssistantMessage: Message = {
            id: `stream-${Date.now()}`,
            role: 'assistant',
            content: '',
            created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, tempUserMessage, tempAssistantMessage]);
        setIsLoading(true);
        setError(null);

        try {
            const stream = await sendMessageStream(chatId, content);
            for await (const event of stream) {
                if (event.type === 'ack') {
                    setMessages((prev) =>
                        prev.map((msg) => (msg.id === tempUserMessage.id ? event.message : msg))
                    );
                }
                if (event.type === 'delta') {
                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === tempAssistantMessage.id
                                ? { ...msg, content: msg.content + event.text }
                                : msg
                        )
                    );
                }
                if (event.type === 'done') {
                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === tempAssistantMessage.id ? event.message : msg
                        )
                    );
                    setRefreshKey((t) => t + 1);
                    refreshChatList();
                    break;
                }
                if (event.type === 'error') {
                    setError(event.error);
                    setMessages((prev) => prev.filter((msg) => msg.id !== tempAssistantMessage.id));
                    break;
                }
            }
        } catch (err) {
            setError('Failed to send message. Check if services are running.');
            console.error(err);
            setMessages((prev) =>
                prev.filter((m) => m.id !== tempUserMessage.id && m.id !== tempAssistantMessage.id)
            );
        } finally {
            setIsLoading(false);
        }
    }, [chatId, isLoading]);

    return (
        <div className="chat-window">
            <header className="chat-header">
                <div className="header-left">
                    <h1>🤖 AutoWealth Agent</h1>
                    <span className="subtitle">AI Spend Optimizer for Autonomous Commerce</span>
                </div>
                <BalanceDisplay refreshTrigger={refreshKey} />
            </header>

            <div className="product-banner">
                <div className="use-case">
                    <span className="tag">Focus Use Case</span>
                    <strong>Keep AI API spend under a monthly budget while the agent pays per-use.</strong>
                    <span className="muted">Advisor proposes limits → you approve → policy enforces every payment.</span>
                    <span className="muted">Tracks: Trustless Agent • Micropayments • Autonomous Commerce</span>
                </div>
            </div>

            <div className="workspace">
                <section className="chat-panel">
                    <div className="chat-layout">
                        <ChatList
                            chats={chats}
                            activeChatId={chatId}
                            onSelect={setChatId}
                            onCreate={handleCreateChat}
                        />
                        <div className="chat-content">
                            <QuickActions onAction={handleSend} disabled={isLoading || !chatId} />

                            {error && (
                                <div className="error-banner">
                                    <span>⚠️ {error}</span>
                                    <button onClick={() => setError(null)}>✕</button>
                                </div>
                            )}

                            <main className="chat-main">
                                <MessageList
                                    messages={messages}
                                    isLoading={isLoading}
                                    onSuggestionClick={handleSend}
                                />
                                <div ref={messagesEndRef} />
                            </main>

                            <footer className="chat-footer">
                                <MessageInput onSend={handleSend} disabled={isLoading || !chatId} />
                            </footer>
                        </div>
                    </div>
                </section>

                <aside className="side-panel">
                    <AdvisorPanel
                        refreshKey={refreshKey}
                        userId={userId}
                        defaultGoal={defaultMonthlyBudget}
                        onApplied={() => setRefreshKey((t) => t + 1)}
                    />
                    <SafetyControlsPanel refreshKey={refreshKey} userId={userId} onChange={() => setRefreshKey((t) => t + 1)} />
                    <PolicyCockpit refreshKey={refreshKey} onPolicyChange={() => setRefreshKey((t) => t + 1)} />
                    <AnalyticsPanel refreshKey={refreshKey} userId={userId} />
                    <PolicySimulationPanel userId={userId} />
                    <MarketplacePanel userId={userId} onPurchase={() => setRefreshKey((t) => t + 1)} />
                    <VendorComparisonPanel />
                    <X402DemoPanel userId={userId} onPaymentComplete={() => setRefreshKey((t) => t + 1)} />
                    <ReceiptsPanel refreshKey={refreshKey} userId={userId} />
                </aside>
            </div>
        </div>
    );
}
