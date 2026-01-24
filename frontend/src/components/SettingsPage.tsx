import { useEffect, useState } from 'react';
import { deleteAccount, updateSafetyStatus } from '../api/aiService';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_SETTINGS, saveLocalSettings, upsertUserSettings, type UserSettings } from '../lib/userSettings';

interface SettingsPageProps {
    userId: string;
    userEmail?: string | null;
    settings?: UserSettings;
    onSettingsChange?: (settings: UserSettings) => void;
}

export function SettingsPage({ userId, userEmail, settings: initialSettings, onSettingsChange }: SettingsPageProps) {
    const [settings, setSettings] = useState<UserSettings>(
        initialSettings ? { ...DEFAULT_SETTINGS, ...initialSettings, user_id: userId } : { ...DEFAULT_SETTINGS, user_id: userId }
    );
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (initialSettings) {
            setSettings({ ...DEFAULT_SETTINGS, ...initialSettings, user_id: userId });
        }
    }, [initialSettings, userId]);

    const handleSave = async () => {
        setStatus(null);
        setError(null);
        const payload: UserSettings = {
            ...settings,
            user_id: userId,
        };
        const saved = await upsertUserSettings(payload);
        if (!saved) {
            setError('Failed to save settings. Check Supabase table permissions and schema.');
            return;
        }
        saveLocalSettings(saved);
        await updateSafetyStatus(
            {
                safeMode: Boolean(settings.safe_mode),
                autoBudget: Boolean(settings.auto_budget),
            },
            userId
        );
        setStatus('Settings saved.');
        onSettingsChange?.(saved);
    };

    const handleDeleteAccount = async () => {
        const confirmed = window.confirm(
            'Delete your account and all data? This cannot be undone.'
        );
        if (!confirmed) return;
        setDeleting(true);
        setStatus(null);
        setError(null);
        try {
            await deleteAccount(userId);
            localStorage.removeItem(`autowealth-settings:${userId}`);
            localStorage.removeItem(`autowealth-receipts:${userId}`);
            localStorage.removeItem(`autowealth-active-chat:${userId}`);
            await supabase.auth.signOut();
        } catch (err) {
            setError('Failed to delete account. Please try again.');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="settings-page">
            <section className="panel settings-panel">
                <div className="panel-header">
                    <div>
                        <h3 className="panel-title">Profile & Defaults</h3>
                        <p className="panel-subtitle">Personalize your spend assistant.</p>
                    </div>
                </div>

                <label>
                    Display name
                    <input
                        type="text"
                        value={settings.display_name || ''}
                        onChange={(e) => {
                            const next = { ...settings, display_name: e.target.value };
                            setSettings(next);
                            onSettingsChange?.(next);
                        }}
                        placeholder="Your name"
                    />
                </label>

                <label>
                    Default monthly budget (USDC)
                    <input
                        type="number"
                        min="1"
                        step="0.5"
                        value={settings.monthly_budget ?? 20}
                        onChange={(e) => {
                            const next = { ...settings, monthly_budget: Number(e.target.value) };
                            setSettings(next);
                            onSettingsChange?.(next);
                        }}
                    />
                </label>

                <label>
                    UI scale
                    <input
                        type="range"
                        min="0.75"
                        max="1.5"
                        step="0.05"
                        value={settings.ui_scale ?? 1}
                        onChange={(e) => {
                            const next = { ...settings, ui_scale: Number(e.target.value) };
                            setSettings(next);
                            onSettingsChange?.(next);
                            saveLocalSettings(next);
                        }}
                    />
                    <span className="range-value">{(settings.ui_scale ?? 1).toFixed(2)}×</span>
                </label>

                <div className="settings-meta">
                    <span>Signed in as {userEmail || 'user'}</span>
                </div>
            </section>

            <section className="panel settings-panel">
                <div className="panel-header">
                    <div>
                        <h3 className="panel-title">Safety Defaults</h3>
                        <p className="panel-subtitle">Apply guardrails automatically.</p>
                    </div>
                </div>

                <label className="toggle-row">
                    <div>
                        <strong>Safe mode by default</strong>
                        <span>Require approval for the first spend.</span>
                    </div>
                    <input
                        type="checkbox"
                        checked={Boolean(settings.safe_mode)}
                        onChange={(e) => {
                            const next = { ...settings, safe_mode: e.target.checked };
                            setSettings(next);
                            onSettingsChange?.(next);
                        }}
                    />
                </label>

                <label className="toggle-row">
                    <div>
                        <strong>Auto-budgeting</strong>
                        <span>Auto-adjust limits when warnings appear.</span>
                    </div>
                    <input
                        type="checkbox"
                        checked={Boolean(settings.auto_budget)}
                        onChange={(e) => {
                            const next = { ...settings, auto_budget: e.target.checked };
                            setSettings(next);
                            onSettingsChange?.(next);
                        }}
                    />
                </label>
            </section>

            <section className="panel settings-panel">
                <div className="panel-header">
                    <div>
                        <h3 className="panel-title">Notifications</h3>
                        <p className="panel-subtitle">Stay informed about policy events.</p>
                    </div>
                </div>

                <label className="toggle-row">
                    <div>
                        <strong>Policy breach alerts</strong>
                        <span>Notify when a payment is blocked.</span>
                    </div>
                    <input type="checkbox" checked readOnly />
                </label>

                <label className="toggle-row">
                    <div>
                        <strong>Weekly spend summary</strong>
                        <span>Send a weekly budget recap.</span>
                    </div>
                    <input type="checkbox" />
                </label>
            </section>

            {error && <div className="panel-error">{error}</div>}
            {status && <div className="panel-success">{status}</div>}

            <section className="panel settings-panel danger">
                <div className="panel-header">
                    <div>
                        <h3 className="panel-title">Danger Zone</h3>
                        <p className="panel-subtitle">Delete your account and all stored data.</p>
                    </div>
                </div>
                <button className="btn btn-danger" onClick={handleDeleteAccount} disabled={deleting}>
                    {deleting ? 'Deleting...' : 'Delete account'}
                </button>
            </section>

            <button className="btn btn-primary" onClick={handleSave}>
                Save settings
            </button>
        </div>
    );
}
