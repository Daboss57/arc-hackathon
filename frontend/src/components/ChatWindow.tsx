import { useCallback, useEffect, useRef, useState } from 'react';
import { createChat, sendMessageStream, type Message } from '../api/aiService';
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

interface ChatWindowProps {
    userId: string;
    defaultMonthlyBudget?: number | null;
}

export function ChatWindow({ userId, defaultMonthlyBudget }: ChatWindowProps) {
    const [chatId, setChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initialize chat on mount
    useEffect(() => {
        const initChat = async () => {
            try {
                const chat = await createChat(userId, 'AutoWealth Demo');
                setChatId(chat.id);
            } catch (err) {
                setError('Failed to initialize chat. Make sure the AI service is running on port 3002.');
                console.error(err);
            }
        };
        initChat();
    }, []);

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
