import { useCallback, useEffect, useRef, useState } from 'react';
import { createChat, sendMessage, type Message } from '../api/aiService';
import { BalanceDisplay } from './BalanceDisplay';
import { MessageInput } from './MessageInput';
import { MessageList } from './MessageList';
import { QuickActions } from './QuickActions';

const USER_ID = 'demo-user';

export function ChatWindow() {
    const [chatId, setChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
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
            setRefreshTrigger((t) => t + 1);
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
                    <span className="subtitle">AI-Powered Financial Assistant</span>
                </div>
                <BalanceDisplay refreshTrigger={refreshTrigger} />
            </header>

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
    );
}
