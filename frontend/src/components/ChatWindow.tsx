import { useCallback, useEffect, useRef, useState } from 'react';
import { createChat, sendMessage, type Message } from '../api/aiService';
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

const USER_ID = 'demo-user';

export function ChatWindow() {
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
                const chat = await createChat(USER_ID, 'AutoWealth Demo');
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
        setMessages((prev) => [...prev, tempUserMessage]);
        setIsLoading(true);
        setError(null);

        try {
            const response = await sendMessage(chatId, content);

            // Replace temp message with real one and add assistant response
            setMessages((prev) => {
                const filtered = prev.filter((m) => m.id !== tempUserMessage.id);
                const newMessages = [response.message];
                if (response.assistant_message) {
                    newMessages.push(response.assistant_message);
                }
                return [...filtered, ...newMessages];
            });

            // Refresh balance after any transaction-related message
            setRefreshKey((t) => t + 1);
        } catch (err) {
            setError('Failed to send message. Check if services are running.');
            console.error(err);
            // Remove temporary message on error
            setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
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
                    <AdvisorPanel refreshKey={refreshKey} userId={USER_ID} onApplied={() => setRefreshKey((t) => t + 1)} />
                    <SafetyControlsPanel refreshKey={refreshKey} userId={USER_ID} onChange={() => setRefreshKey((t) => t + 1)} />
                    <PolicyCockpit refreshKey={refreshKey} onPolicyChange={() => setRefreshKey((t) => t + 1)} />
                    <AnalyticsPanel refreshKey={refreshKey} userId={USER_ID} />
                    <PolicySimulationPanel userId={USER_ID} />
                    <MarketplacePanel userId={USER_ID} onPurchase={() => setRefreshKey((t) => t + 1)} />
                    <VendorComparisonPanel />
                    <X402DemoPanel userId={USER_ID} onPaymentComplete={() => setRefreshKey((t) => t + 1)} />
                    <ReceiptsPanel refreshKey={refreshKey} userId={USER_ID} />
                </aside>
            </div>
        </div>
    );
}
