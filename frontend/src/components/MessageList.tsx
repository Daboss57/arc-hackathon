import type { Message } from '../api/aiService';

interface MessageListProps {
    messages: Message[];
    isLoading?: boolean;
    onSuggestionClick?: (message: string) => void;
}

// Simple markdown-like formatting
function formatMessage(text: string): JSX.Element[] {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let listItems: string[] = [];
    let listKey = 0;

    const flushList = () => {
        if (listItems.length > 0) {
            elements.push(
                <ul key={`list-${listKey++}`} className="message-list-items">
                    {listItems.map((item, i) => (
                        <li key={i}>{formatInline(item)}</li>
                    ))}
                </ul>
            );
            listItems = [];
        }
    };

    const formatInline = (text: string): React.ReactNode => {
        // Bold: **text** or __text__
        const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i}>{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('__') && part.endsWith('__')) {
                return <strong key={i}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    lines.forEach((line, i) => {
        const trimmed = line.trim();

        // List items (- or * or numbered)
        if (/^[-*•]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
            const content = trimmed.replace(/^[-*•]\s|^\d+\.\s/, '');
            listItems.push(content);
        } else {
            flushList();

            // Headers
            if (trimmed.startsWith('### ')) {
                elements.push(<h4 key={i} className="message-h4">{formatInline(trimmed.slice(4))}</h4>);
            } else if (trimmed.startsWith('## ')) {
                elements.push(<h3 key={i} className="message-h3">{formatInline(trimmed.slice(3))}</h3>);
            } else if (trimmed.startsWith('# ')) {
                elements.push(<h2 key={i} className="message-h2">{formatInline(trimmed.slice(2))}</h2>);
            } else if (trimmed === '') {
                // Skip empty lines
            } else {
                elements.push(<p key={i} className="message-p">{formatInline(line)}</p>);
            }
        }
    });

    flushList();
    return elements;
}

const SUGGESTIONS = [
    { emoji: '🎯', text: 'Help me keep AI spend under $20/month.' },
    { emoji: '⚡', text: 'Run the x402 paid API demo.' },
    { emoji: '📜', text: 'Show my spending policies.' },
];

export function MessageList({ messages, isLoading, onSuggestionClick }: MessageListProps) {
    return (
        <div className="message-list">
            {messages.length === 0 && !isLoading && (
                <div className="empty-state">
                    <div className="empty-icon">🤖</div>
                    <h3>AutoWealth Spend Optimizer</h3>
                    <p>Set a budget, approve guardrails, and let the agent pay per-use with x402.</p>
                    <div className="suggestions">
                        {SUGGESTIONS.map((s) => (
                            <button
                                key={s.text}
                                className="suggestion-btn"
                                onClick={() => onSuggestionClick?.(s.text)}
                            >
                                <span className="suggestion-emoji">{s.emoji}</span>
                                <span className="suggestion-text">{s.text}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {messages.map((message) => (
                <div key={message.id} className={`message ${message.role}`}>
                    <div className="message-avatar">
                        {message.role === 'user' ? '👤' : '🤖'}
                    </div>
                    <div className="message-content">
                        <div className="message-text">
                            {formatMessage(message.content)}
                        </div>

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
