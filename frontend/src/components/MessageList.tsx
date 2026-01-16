import type { Message } from '../api/aiService';

interface MessageListProps {
    messages: Message[];
    isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
    return (
        <div className="message-list">
            {messages.length === 0 && !isLoading && (
                <div className="empty-state">
                    <div className="empty-icon">💬</div>
                    <h3>Welcome to AutoWealth Agent</h3>
                    <p>Try asking about your balance, listing vendors, or making a purchase!</p>
                    <div className="suggestions">
                        <span>💰 "What is my balance?"</span>
                        <span>🛒 "List all vendors"</span>
                        <span>📜 "Show my spending policies"</span>
                    </div>
                </div>
            )}

            {messages.map((message) => (
                <div key={message.id} className={`message ${message.role}`}>
                    <div className="message-avatar">
                        {message.role === 'user' ? '👤' : '🤖'}
                    </div>
                    <div className="message-content">
                        <div className="message-text">{message.content}</div>

                        {message.metadata?.executed_tools && message.metadata.executed_tools.length > 0 && (
                            <details className="tool-calls">
                                <summary>
                                    🔧 {message.metadata.executed_tools.length} tool{message.metadata.executed_tools.length > 1 ? 's' : ''} executed
                                </summary>
                                <div className="tool-list">
                                    {message.metadata.executed_tools.map((tool, i) => (
                                        <div key={i} className={`tool-item ${tool.result.ok ? 'success' : 'error'}`}>
                                            <span className="tool-name">{tool.name}</span>
                                            <span className="tool-status">{tool.result.ok ? '✓' : '✗'}</span>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}
                    </div>
                </div>
            ))}

            {isLoading && (
                <div className="message assistant loading">
                    <div className="message-avatar">🤖</div>
                    <div className="message-content">
                        <div className="typing-indicator">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
