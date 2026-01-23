import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const anchorRef = useRef<HTMLElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!openMenuId) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (menuRef.current?.contains(target)) return;
            if (anchorRef.current?.contains(target)) return;
            setOpenMenuId(null);
            setRenameValue('');
            setMenuPosition(null);
            anchorRef.current = null;
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openMenuId]);

    useEffect(() => {
        if (!openMenuId) return;
        const handleClose = () => {
            setOpenMenuId(null);
            setRenameValue('');
            setMenuPosition(null);
            anchorRef.current = null;
        };
        const listNode = listRef.current;
        window.addEventListener('resize', handleClose);
        listNode?.addEventListener('scroll', handleClose, { passive: true });
        return () => {
            window.removeEventListener('resize', handleClose);
            listNode?.removeEventListener('scroll', handleClose);
        };
    }, [openMenuId]);

    useLayoutEffect(() => {
        if (!openMenuId || !anchorRef.current || !menuRef.current || !panelRef.current) return;
        const anchorRect = anchorRef.current.getBoundingClientRect();
        const menuRect = menuRef.current.getBoundingClientRect();
        const panelRect = panelRef.current.getBoundingClientRect();

        let left = anchorRect.right - panelRect.left - menuRect.width;
        const minLeft = 8;
        const maxLeft = Math.max(minLeft, panelRect.width - menuRect.width - 8);
        left = Math.min(Math.max(minLeft, left), maxLeft);

        let top = anchorRect.bottom - panelRect.top + 8;
        if (top + menuRect.height > panelRect.height - 8) {
            top = anchorRect.top - panelRect.top - menuRect.height - 8;
        }
        const minTop = 8;
        const maxTop = Math.max(minTop, panelRect.height - menuRect.height - 8);
        top = Math.min(Math.max(minTop, top), maxTop);
        setMenuPosition({ top, left });
    }, [openMenuId, renameValue]);

    const handleRenameSubmit = (chatId: string) => {
        const value = renameValue.trim();
        if (!value) return;
        onRename(chatId, value);
        setOpenMenuId(null);
        setRenameValue('');
    };
    return (
        <div className="chat-list-panel" ref={panelRef}>
            <div className="chat-list-header">
                <h4>Chats</h4>
                <button className="btn btn-secondary small" onClick={onCreate}>
                    New
                </button>
            </div>
            <div className="chat-list" ref={listRef}>
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
                                    const anchor = event.currentTarget as HTMLElement;
                                    if (openMenuId === chat.id) {
                                        setOpenMenuId(null);
                                        setRenameValue('');
                                        setMenuPosition(null);
                                        anchorRef.current = null;
                                        return;
                                    }
                                    anchorRef.current = anchor;
                                    setMenuPosition(null);
                                    setOpenMenuId(chat.id);
                                    setRenameValue(chat.title || '');
                                }}
                            >
                                ⋯
                            </button>
                        </div>
                        <span className="chat-meta">
                            {chat.updated_at ? new Date(chat.updated_at).toLocaleDateString() : '—'}
                        </span>
                    </div>
                ))}
                {chats.length === 0 && <span className="panel-muted">No chats yet.</span>}
            </div>
            {openMenuId && (
                <div
                    ref={menuRef}
                    className="chat-menu"
                    style={menuPosition ? { top: menuPosition.top, left: menuPosition.left } : undefined}
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
                                    handleRenameSubmit(openMenuId);
                                }
                            }}
                        />
                    </label>
                    <div className="chat-menu-actions">
                        <button
                            className="btn btn-secondary small"
                            onClick={() => handleRenameSubmit(openMenuId)}
                        >
                            Save
                        </button>
                        <button
                            className="btn btn-secondary small"
                            onClick={() => {
                                setOpenMenuId(null);
                                setRenameValue('');
                                setMenuPosition(null);
                                anchorRef.current = null;
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
                            setMenuPosition(null);
                            anchorRef.current = null;
                            onDelete(openMenuId);
                        }}
                    >
                        Delete chat
                    </button>
                </div>
            )}
        </div>
    );
}
