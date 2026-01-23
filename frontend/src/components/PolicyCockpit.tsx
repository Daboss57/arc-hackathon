import { useEffect, useState } from 'react';
import { listPolicies, updatePolicy, type Policy, type Rule } from '../api/aiService';

interface PolicyCockpitProps {
    refreshKey?: number;
    onPolicyChange?: () => void;
}

function renderRule(rule: Rule): string {
    switch (rule.type) {
        case 'maxPerTransaction': {
            const max = (rule.params as { max?: number }).max ?? 0;
            return `Max per transaction: ${max} USDC`;
        }
        case 'dailyLimit': {
            const limit = (rule.params as { limit?: number }).limit ?? 0;
            return `Daily limit: ${limit} USDC`;
        }
        case 'monthlyBudget': {
            const budget = (rule.params as { budget?: number }).budget ?? 0;
            return `Monthly budget: ${budget} USDC`;
        }
        case 'vendorWhitelist': {
            const addresses = (rule.params as { addresses?: string[] }).addresses || [];
            const preview = addresses.length ? addresses.slice(0, 2).join(', ') : 'None';
            return `Vendor whitelist: ${preview}${addresses.length > 2 ? '…' : ''}`;
        }
        case 'categoryLimit': {
            const limits = (rule.params as { limits?: Record<string, number> }).limits || {};
            const entries = Object.entries(limits);
            if (!entries.length) return 'Category limits: None';
            return `Category limits: ${entries.map(([key, value]) => `${key} ${value} USDC`).join(', ')}`;
        }
        default:
            return rule.type;
    }
}

export function PolicyCockpit({ refreshKey, onPolicyChange }: PolicyCockpitProps) {
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            try {
                const data = await listPolicies();
                if (!active) return;
                setPolicies(data);
                setError(null);
            } catch (err) {
                if (!active) return;
                setError('Failed to load policies');
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => {
            active = false;
        };
    }, [refreshKey]);

    const handleToggle = async (policy: Policy) => {
        try {
            await updatePolicy(policy.id, { enabled: !policy.enabled });
            setPolicies((prev) =>
                prev.map((p) => (p.id === policy.id ? { ...p, enabled: !p.enabled } : p))
            );
            onPolicyChange?.();
        } catch (err) {
            setError('Failed to update policy');
        }
    };

    return (
        <section className="panel policy-panel">
            <div className="panel-header">
                <div>
                    <h3 className="panel-title">Policy Cockpit</h3>
                    <p className="panel-subtitle">Guardrails enforced before every payment.</p>
                </div>
            </div>

            {loading && <div className="panel-muted">Loading policies…</div>}
            {error && <div className="panel-error">{error}</div>}

            <div className="policy-list">
                {policies.map((policy) => (
                    <div key={policy.id} className={`policy-card ${policy.enabled ? 'enabled' : 'disabled'}`}>
                        <div className="policy-header">
                            <div>
                                <h4>{policy.name}</h4>
                                {policy.description && <p>{policy.description}</p>}
                                <span className="policy-updated">
                                    Updated {new Date(policy.updatedAt).toLocaleDateString()}
                                </span>
                            </div>
                            <button
                                className={`toggle-btn ${policy.enabled ? 'on' : 'off'}`}
                                onClick={() => handleToggle(policy)}
                            >
                                {policy.enabled ? 'Enabled' : 'Disabled'}
                            </button>
                        </div>
                        <div className="policy-rules">
                            {policy.rules.map((rule, index) => (
                                <span key={`${policy.id}-${index}`} className="rule-pill">
                                    {renderRule(rule)}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}

                {!loading && policies.length === 0 && (
                    <div className="panel-muted">No policies yet. Generate one in Advisor Review.</div>
                )}
            </div>
        </section>
    );
}
