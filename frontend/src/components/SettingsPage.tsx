import { useEffect, useState } from 'react';
import { updateSafetyStatus } from '../api/aiService';
import { DEFAULT_SETTINGS, fetchUserSettings, upsertUserSettings, type UserSettings } from '../lib/userSettings';

interface SettingsPageProps {
    userId: string;
    userEmail?: string | null;
    onSettingsChange?: (settings: UserSettings) => void;
}

export function SettingsPage({ userId, userEmail, onSettingsChange }: SettingsPageProps) {
    const [settings, setSettings] = useState<UserSettings>({ ...DEFAULT_SETTINGS, user_id: userId });
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            const data = await fetchUserSettings(userId);
            if (!active) return;
            if (data) {
                setSettings({
                    ...DEFAULT_SETTINGS,
                    ...data,
                    user_id: userId,
                });
            }
        };
        load();
        return () => {
            active = false;
        };
    }, [userId]);

    const handleSave = async () => {
        setStatus(null);
        setError(null);
        const payload: UserSettings = {
            ...settings,
            user_id: userId,
        };
        const saved = await upsertUserSettings(payload);
        if (!saved) {
            setError('Failed to save settings.');
            return;
        }
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
                        onChange={(e) => setSettings((prev) => ({ ...prev, display_name: e.target.value }))}
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
                        onChange={(e) => setSettings((prev) => ({ ...prev, monthly_budget: Number(e.target.value) }))}
                    />
                </label>

                <label>
                    UI scale
                    <input
                        type="range"
                        min="0.9"
                        max="1.3"
                        step="0.05"
                        value={settings.ui_scale ?? 1}
                        onChange={(e) => setSettings((prev) => ({ ...prev, ui_scale: Number(e.target.value) }))}
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
                        onChange={(e) => setSettings((prev) => ({ ...prev, safe_mode: e.target.checked }))}
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
                        onChange={(e) => setSettings((prev) => ({ ...prev, auto_budget: e.target.checked }))}
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

            <button className="btn btn-primary" onClick={handleSave}>
                Save settings
            </button>
        </div>
    );
}
