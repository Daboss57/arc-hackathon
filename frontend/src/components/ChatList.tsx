import { useEffect, useRef, useState } from 'react';
import type { Chat } from '../api/aiService';

interface ChatListProps {
    chats: Chat[];
    activeChatId: string | null;
    onSelect: (chatId: string) => void;
    onCreate: () => void;
    onDelete: (chatId: string) => void;
    onRename: (chatId: string, title: string) => void;
}

export function ChatList({ chats, activeChatId, onSelect, onCreate, onDelete, onRename }: ChatListProps) {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState<string>('');
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!openMenuId) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
                setRenameValue('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openMenuId]);

    const handleRenameSubmit = (chatId: string) => {
        const value = renameValue.trim();
        if (!value) return;
        onRename(chatId, value);
        setOpenMenuId(null);
        setRenameValue('');
    };
    return (
        <div className="chat-list-panel">
            <div className="chat-list-header">
                <h4>Chats</h4>
                <button className="btn btn-secondary small" onClick={onCreate}>
                    New
                </button>
            </div>
            <div className="chat-list">
                {chats.map((chat) => (
                    <div
                        key={chat.id}
                        className={`chat-list-item ${activeChatId === chat.id ? 'active' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelect(chat.id)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onSelect(chat.id);
                            }
                        }}
                    >
                        <div className="chat-list-item-header">
                            <span className="chat-title">{chat.title || 'New Chat'}</span>
                            <button
                                className="chat-menu-btn"
                                type="button"
                                aria-label="Chat options"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setOpenMenuId((prev) => (prev === chat.id ? null : chat.id));
                                    setRenameValue(chat.title || '');
                                }}
                            >
                                ⋯
                            </button>
                        </div>
                        <span className="chat-meta">
                            {chat.updated_at ? new Date(chat.updated_at).toLocaleDateString() : '—'}
                        </span>
                        {openMenuId === chat.id && (
                            <div
                                ref={menuRef}
                                className="chat-menu"
                                onClick={(event) => event.stopPropagation()}
                            >
                                <label className="chat-menu-label">
                                    Rename
                                    <input
                                        type="text"
                                        value={renameValue}
                                        onChange={(event) => setRenameValue(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                handleRenameSubmit(chat.id);
                                            }
                                        }}
                                    />
                                </label>
                                <div className="chat-menu-actions">
                                    <button
                                        className="btn btn-secondary small"
                                        onClick={() => handleRenameSubmit(chat.id)}
                                    >
                                        Save
                                    </button>
                                    <button
                                        className="btn btn-secondary small"
                                        onClick={() => {
                                            setOpenMenuId(null);
                                            setRenameValue('');
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                                <button
                                    className="btn btn-danger small"
                                    onClick={() => {
                                        setOpenMenuId(null);
                                        setRenameValue('');
                                        onDelete(chat.id);
                                    }}
                                >
                                    Delete chat
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                {chats.length === 0 && <span className="panel-muted">No chats yet.</span>}
            </div>
        </div>
    );
}
