import type { Chat } from '../api/aiService';

interface ChatListProps {
    chats: Chat[];
    activeChatId: string | null;
    onSelect: (chatId: string) => void;
    onCreate: () => void;
}

export function ChatList({ chats, activeChatId, onSelect, onCreate }: ChatListProps) {
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
                    <button
                        key={chat.id}
                        className={`chat-list-item ${activeChatId === chat.id ? 'active' : ''}`}
                        onClick={() => onSelect(chat.id)}
                    >
                        <span className="chat-title">{chat.title || 'New Chat'}</span>
                        <span className="chat-meta">
                            {chat.updated_at ? new Date(chat.updated_at).toLocaleDateString() : '—'}
                        </span>
                    </button>
                ))}
                {chats.length === 0 && <span className="panel-muted">No chats yet.</span>}
            </div>
        </div>
    );
}
