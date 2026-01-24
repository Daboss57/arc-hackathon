import { useRef, useState } from 'react';

interface MessageInputProps {
    onSend: (content: string) => void;
    disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
    const [content, setContent] = useState('');
    const inputRef = useRef<HTMLTextAreaElement | null>(null);

    const handleSubmit = (e: React.FormEvent | React.KeyboardEvent) => {
        e.preventDefault();
        if (content.trim() && !disabled) {
            onSend(content.trim());
            setContent('');
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            });
        }
    };

    return (
        <form className="message-input" onSubmit={handleSubmit}>
            <textarea
                ref={inputRef}
                rows={1}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                    }
                }}
                placeholder="Ask about budgets, policies, or run an x402 demo payment..."
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
