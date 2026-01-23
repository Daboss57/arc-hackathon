import type { Chat } from '../api/aiService';

interface ChatListProps {
    chats: Chat[];
    activeChatId: string | null;
    onSelect: (chatId: string) => void;
    onCreate: () => void;
    onDelete: (chatId: string) => void;
}

export function ChatList({ chats, activeChatId, onSelect, onCreate, onDelete }: ChatListProps) {
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
                                    onDelete(chat.id);
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
        </div>
    );
}
