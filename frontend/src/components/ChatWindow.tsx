import { useCallback, useEffect, useRef, useState } from 'react';
import { createChat, deleteChat, getMessages, listChats, renameChat, sendMessageStream, type Chat, type Message } from '../api/aiService';
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
    const [messagesByChat, setMessagesByChat] = useState<Record<string, Message[]>>({});
    const [chats, setChats] = useState<Chat[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
    const [streamingChatId, setStreamingChatId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const streamingIdRef = useRef<string | null>(null);

    const activeMessages = chatId ? messagesByChat[chatId] ?? [] : [];
    const updateMessagesForChat = useCallback((targetChatId: string, updater: (prev: Message[]) => Message[]) => {
        setMessagesByChat((prev) => {
            const current = prev[targetChatId] ?? [];
            const next = updater(current);
            return { ...prev, [targetChatId]: next };
        });
    }, []);

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
                    setChatId(null);
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
            if (!chatId) {
                return;
            }
            try {
                const history = await getMessages(chatId);
                setMessagesByChat((prev) => {
                    const existing = prev[chatId] ?? [];
                    if (existing.length === 0) {
                        return { ...prev, [chatId]: history };
                    }
                    const merged = new Map<string, Message>();
                    existing.forEach((msg) => merged.set(msg.id, msg));
                    history.forEach((msg) => merged.set(msg.id, msg));
                    const combined = Array.from(merged.values()).sort((a, b) =>
                        a.created_at.localeCompare(b.created_at)
                    );
                    return { ...prev, [chatId]: combined };
                });
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

    const handleDeleteChat = useCallback(
        async (id: string) => {
            const shouldDelete = window.confirm('Delete this chat? This cannot be undone.');
            if (!shouldDelete) return;
            try {
                await deleteChat(id);
                let nextChats: Chat[] = [];
                setChats((prev) => {
                    nextChats = prev.filter((chat) => chat.id !== id);
                    return nextChats;
                });
                if (chatId === id) {
                    localStorage.removeItem(`autowealth-active-chat:${userId}`);
                    if (nextChats.length > 0) {
                        setChatId(nextChats[0].id);
                    } else {
                        setChatId(null);
                    }
                }
            } catch (err) {
                setError('Failed to delete chat.');
            }
        },
        [chatId, userId]
    );

    const handleRenameChat = useCallback(async (id: string, title: string) => {
        try {
            const updated = await renameChat(id, title);
            setChats((prev) => prev.map((chat) => (chat.id === id ? { ...chat, ...updated } : chat)));
        } catch (err) {
            setError('Failed to rename chat.');
        }
    }, []);

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
    }, [activeMessages]);

    const handleSend = useCallback(async (content: string) => {
        if (isLoading) return;

        let activeChatId = chatId;
        if (!activeChatId) {
            try {
                const chat = await createChat(userId);
                activeChatId = chat.id;
                setChats((prev) => [chat, ...prev]);
                setChatId(chat.id);
                setMessagesByChat((prev) => ({ ...prev, [chat.id]: [] }));
            } catch (err) {
                setError('Failed to create a new chat.');
                return;
            }
        }

        // Add user message immediately
        const tempUserMessage: Message = {
            id: `temp-${Date.now()}`,
            role: 'user',
            content,
            created_at: new Date().toISOString(),
        };
        updateMessagesForChat(activeChatId, (prev) => [...prev, tempUserMessage]);
        setIsLoading(true);
        setStreamingMessageId(null);
        setStreamingChatId(activeChatId);
        streamingIdRef.current = null;
        setError(null);

        try {
            const stream = await sendMessageStream(activeChatId, content);
            for await (const event of stream) {
                if (event.type === 'ack') {
                    updateMessagesForChat(activeChatId, (prev) =>
                        prev.map((msg) => (msg.id === tempUserMessage.id ? event.message : msg))
                    );
                }
                if (event.type === 'delta') {
                    if (!streamingIdRef.current) {
                        const draftId = `stream-${Date.now()}`;
                        streamingIdRef.current = draftId;
                        setStreamingMessageId(draftId);
                        updateMessagesForChat(activeChatId, (prev) => [
                            ...prev,
                            {
                                id: draftId,
                                role: 'assistant',
                                content: event.text,
                                created_at: new Date().toISOString(),
                            },
                        ]);
                    } else {
                        const currentId = streamingIdRef.current;
                        updateMessagesForChat(activeChatId, (prev) =>
                            prev.map((msg) =>
                                msg.id === currentId
                                    ? { ...msg, content: msg.content + event.text }
                                    : msg
                            )
                        );
                    }
                }
                if (event.type === 'done') {
                    const currentId = streamingIdRef.current;
                    if (currentId) {
                        updateMessagesForChat(activeChatId, (prev) =>
                            prev.map((msg) =>
                                msg.id === currentId ? event.message : msg
                            )
                        );
                    } else {
                        updateMessagesForChat(activeChatId, (prev) => [...prev, event.message]);
                    }
                    streamingIdRef.current = null;
                    setStreamingMessageId(null);
                    setStreamingChatId(null);
                    setRefreshKey((t) => t + 1);
                    refreshChatList();
                    break;
                }
                if (event.type === 'error') {
                    setError(event.error);
                    const currentId = streamingIdRef.current;
                    if (currentId) {
                        updateMessagesForChat(activeChatId, (prev) =>
                            prev.filter((msg) => msg.id !== currentId)
                        );
                    }
                    streamingIdRef.current = null;
                    setStreamingMessageId(null);
                    setStreamingChatId(null);
                    break;
                }
            }
        } catch (err) {
            setError('Failed to send message. Check if services are running.');
            console.error(err);
            const currentId = streamingIdRef.current;
            updateMessagesForChat(activeChatId, (prev) =>
                prev.filter((m) => m.id !== tempUserMessage.id && m.id !== currentId)
            );
            streamingIdRef.current = null;
            setStreamingMessageId(null);
            setStreamingChatId(null);
        } finally {
            setIsLoading(false);
        }
    }, [chatId, isLoading, refreshChatList, updateMessagesForChat, userId]);

    return (
        <div className="chat-window">
            <header className="chat-header">
                <div className="header-left">
                    <h1>🤖 AutoWealth Agent</h1>
                    <span className="subtitle">AI Spend Optimizer for Autonomous Commerce</span>
                </div>
                <BalanceDisplay refreshTrigger={refreshKey} />
            </header>

            <div className="workspace">
                <section className="chat-panel">
                    <div className="chat-layout">
                        <ChatList
                            chats={chats}
                            activeChatId={chatId}
                            onSelect={setChatId}
                            onCreate={handleCreateChat}
                            onDelete={handleDeleteChat}
                            onRename={handleRenameChat}
                        />
                        <div className="chat-content">
                            <QuickActions onAction={handleSend} disabled={isLoading} />

                            {error && (
                                <div className="error-banner">
                                    <span>⚠️ {error}</span>
                                    <button onClick={() => setError(null)}>✕</button>
                                </div>
                            )}

                            <main className="chat-main">
                                <MessageList
                                    messages={activeMessages}
                                    isLoading={isLoading}
                                    showTyping={isLoading && streamingChatId === chatId && !streamingMessageId}
                                    onSuggestionClick={handleSend}
                                />
                                <div ref={messagesEndRef} />
                            </main>

                            <footer className="chat-footer">
                                <MessageInput onSend={handleSend} disabled={isLoading} />
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
