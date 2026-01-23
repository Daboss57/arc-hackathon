interface QuickActionsProps {
    onAction: (message: string) => void;
    disabled?: boolean;
}

const QUICK_ACTIONS = [
    { label: '💰 Balance', message: 'What is my treasury balance?' },
    { label: '🎯 Optimize Spend', message: 'Help me keep AI spend under $20/month.' },
    { label: '🛒 Marketplace', message: 'List vendors and recommend the best value purchase.' },
    { label: '📜 Policies', message: 'Show my spending policies' },
    { label: '⚡ x402 Demo', message: 'Run the paid API demo using x402.' },
    { label: '🧾 Receipts', message: 'Show my recent payment receipts' },
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
