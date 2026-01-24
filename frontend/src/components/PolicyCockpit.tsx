import { useEffect, useState } from 'react';
import {
    listPolicies,
    updatePolicy,
    deletePolicy as deletePolicyInDb,
    type Policy,
    type Rule,
} from '../api/aiService';

interface PolicyCockpitProps {
    userId: string;
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

export function PolicyCockpit({ refreshKey, onPolicyChange, userId }: PolicyCockpitProps) {
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) return;
        let active = true;
        const load = async () => {
            setLoading(true);
            try {
                const data = await listPolicies(userId);
                if (!active) return;
                setPolicies(data);
                setError(null);
            } catch (err) {
                if (!active) return;
                setError('Failed to load policies');
                console.error(err);
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => {
            active = false;
        };
    }, [refreshKey, userId]);

    const handleToggle = async (policy: Policy) => {
        try {
            await updatePolicy(policy.id, { enabled: !policy.enabled }, userId);
            setPolicies((prev) =>
                prev.map((p) => (p.id === policy.id ? { ...p, enabled: !p.enabled } : p))
            );
            onPolicyChange?.();
        } catch (err) {
            setError('Failed to update policy');
        }
    };

    const handleDelete = async (policyId: string) => {
        if (!confirm('Delete this policy?')) return;
        try {
            await deletePolicyInDb(policyId, userId);
            setPolicies((prev) => prev.filter((p) => p.id !== policyId));
            onPolicyChange?.();
        } catch (err) {
            setError('Failed to delete policy');
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
                {policies.map((policy) => {
                    const rules = Array.isArray(policy.rules) ? policy.rules : [];
                    return (
                    <div key={policy.id} className={`policy-card ${policy.enabled ? 'enabled' : 'disabled'}`}>
                        <div className="policy-header">
                            <div>
                                <h4>{policy.name || 'Unnamed Policy'}</h4>
                                {policy.description && <p>{policy.description}</p>}
                                {policy.updatedAt && (
                                    <span className="policy-updated">
                                        Updated {new Date(policy.updatedAt).toLocaleDateString()}
                                    </span>
                                )}
                            </div>
                            <div className="policy-actions">
                                <label className="toggle-row inline policy-toggle">
                                    <span>{policy.enabled ? 'On' : 'Off'}</span>
                                    <input
                                        type="checkbox"
                                        checked={policy.enabled}
                                        onChange={() => handleToggle(policy)}
                                    />
                                </label>
                                <button 
                                    className="btn btn-secondary small"
                                    onClick={() => handleDelete(policy.id)}
                                    title="Delete policy"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                        <div className="policy-rules">
                            {rules.map((rule, index) => (
                                <span key={`${policy.id}-${index}`} className="rule-pill">
                                    {renderRule(rule)}
                                </span>
                            ))}
                        </div>
                    </div>
                    );
                })}

                {!loading && policies.length === 0 && (
                    <div className="panel-muted">No policies yet. Ask the AI to create one!</div>
                )}
            </div>
        </section>
    );
}
