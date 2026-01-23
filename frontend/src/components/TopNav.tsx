interface TopNavProps {
    activeView: 'dashboard' | 'settings';
    onNavigate: (view: 'dashboard' | 'settings') => void;
    userLabel?: string | null;
    onSignOut: () => void;
}

export function TopNav({ activeView, onNavigate, userLabel, onSignOut }: TopNavProps) {
    return (
        <header className="top-nav">
            <div className="brand">
                <span className="brand-icon">🪙</span>
                <div>
                    <h2>AutoWealth Agent</h2>
                    <p>Agentic commerce on Arc + USDC</p>
                </div>
            </div>

            <nav className="nav-tabs">
                <button
                    className={activeView === 'dashboard' ? 'active' : ''}
                    onClick={() => onNavigate('dashboard')}
                >
                    Dashboard
                </button>
                <button
                    className={activeView === 'settings' ? 'active' : ''}
                    onClick={() => onNavigate('settings')}
                >
                    Settings
                </button>
            </nav>

            <div className="nav-actions">
                <span className="user-pill">{userLabel || 'Signed in'}</span>
                <button className="btn btn-secondary small" onClick={onSignOut}>
                    Sign out
                </button>
            </div>
        </header>
    );
}
