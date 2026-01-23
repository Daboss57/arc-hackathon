import { useEffect, useState } from 'react';
import { getSafetyStatus, updateSafetyStatus, type SafetyStatus } from '../api/aiService';

interface SafetyControlsPanelProps {
    refreshKey?: number;
    userId: string;
    onChange?: () => void;
}

export function SafetyControlsPanel({ refreshKey, userId, onChange }: SafetyControlsPanelProps) {
    const [status, setStatus] = useState<SafetyStatus | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const data = await getSafetyStatus(userId);
                if (!active) return;
                setStatus(data);
                setError(null);
            } catch (err) {
                if (!active) return;
                setError('Failed to load safety controls');
            }
        };
        load();
        return () => {
            active = false;
        };
    }, [refreshKey, userId]);

    const update = async (updates: Partial<SafetyStatus> & { resetApproval?: boolean }) => {
        try {
            const next = await updateSafetyStatus(updates, userId);
            setStatus(next);
            setError(null);
            onChange?.();
        } catch (err) {
            setError('Failed to update safety controls');
        }
    };

    if (!status && !error) {
        return (
            <section className="panel safety-panel">
                <div className="panel-header">
                    <div>
                        <h3 className="panel-title">Safety Controls</h3>
                        <p className="panel-subtitle">Pause payments or require approval.</p>
                    </div>
                </div>
                <div className="panel-muted">Loading safety status…</div>
            </section>
        );
    }

    return (
        <section className="panel safety-panel">
            <div className="panel-header">
                <div>
                    <h3 className="panel-title">Safety Controls</h3>
                    <p className="panel-subtitle">Pause payments or require approval.</p>
                </div>
            </div>

            {error && <div className="panel-error">{error}</div>}

            {status && (
                <div className="toggle-list">
                    <label className="toggle-row">
                        <div>
                            <strong>Kill switch</strong>
                            <span>Immediately pause all payments.</span>
                        </div>
                        <input
                            type="checkbox"
                            checked={status.paymentsPaused}
                            onChange={(e) => update({ paymentsPaused: e.target.checked })}
                        />
                    </label>

                    <label className="toggle-row">
                        <div>
                            <strong>Safe mode</strong>
                            <span>First spend requires explicit approval.</span>
                        </div>
                        <input
                            type="checkbox"
                            checked={status.safeMode}
                            onChange={(e) => update({ safeMode: e.target.checked })}
                        />
                    </label>

                    <label className="toggle-row">
                        <div>
                            <strong>Auto-budgeting</strong>
                            <span>Advisor auto-adjusts limits on warnings.</span>
                        </div>
                        <input
                            type="checkbox"
                            checked={status.autoBudget}
                            onChange={(e) => update({ autoBudget: e.target.checked })}
                        />
                    </label>

                    {status.safeMode && (
                        <div className="panel-muted">
                            {status.approvalRequired ? (
                                'Approval required for the next payment.'
                            ) : (
                                <>
                                    Safe mode approval already satisfied.
                                    <button
                                        className="btn btn-secondary small"
                                        onClick={() => update({ resetApproval: true })}
                                    >
                                        Require approval again
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
