interface QuickActionsProps {
    onAction: (message: string) => void;
    disabled?: boolean;
}

const QUICK_ACTIONS = [
    { label: '💰 Balance', message: 'What is my treasury balance?' },
    { label: '🛒 Vendors', message: 'List all vendors and their products' },
    { label: '📜 Policies', message: 'Show my spending policies' },
    { label: '📊 Analytics', message: 'Show my spending analytics' },
    { label: '🛍️ Orders', message: 'List my recent orders' },
];

export function QuickActions({ onAction, disabled }: QuickActionsProps) {
    return (
        <div className="quick-actions">
            {QUICK_ACTIONS.map((action) => (
                <button
                    key={action.label}
                    onClick={() => onAction(action.message)}
                    disabled={disabled}
                    className="quick-action-btn"
                >
                    {action.label}
                </button>
            ))}
        </div>
    );
}
