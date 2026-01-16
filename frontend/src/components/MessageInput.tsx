import { useState } from 'react';

interface MessageInputProps {
    onSend: (content: string) => void;
    disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
    const [content, setContent] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (content.trim() && !disabled) {
            onSend(content.trim());
            setContent('');
        }
    };

    return (
        <form className="message-input" onSubmit={handleSubmit}>
            <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Ask about your balance, vendors, or make a purchase..."
                disabled={disabled}
            />
            <button type="submit" disabled={disabled || !content.trim()}>
                {disabled ? (
                    <span className="loading-dots">●●●</span>
                ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                )}
            </button>
        </form>
    );
}
