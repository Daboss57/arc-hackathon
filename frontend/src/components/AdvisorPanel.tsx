import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    createPolicy,
    getSpendingAnalytics,
    getSafetyStatus,
    listPolicies,
    updatePolicy,
    type Policy,
    type Rule,
    type SpendingAnalytics,
} from '../api/aiService';

interface AdvisorPanelProps {
    refreshKey?: number;
    userId: string;
    onApplied?: () => void;
}

interface Recommendation {
    rules: Rule[];
    monthlyBudget: number;
    dailyLimit: number;
    maxPerTransaction: number;
    reasons: string[];
}

const DEFAULT_GOAL = '20';

function roundTwo(value: number): number {
    return Math.round(value * 100) / 100;
}

function formatUsd(value: number): string {
    return value.toFixed(2);
}

function extractLimits(policies: Policy[]) {
    const limits: {
        monthlyBudget?: number;
        dailyLimit?: number;
        maxPerTransaction?: number;
    } = {};

    for (const policy of policies) {
        for (const rule of policy.rules) {
            if (rule.type === 'monthlyBudget' && limits.monthlyBudget === undefined) {
                limits.monthlyBudget = Number((rule.params as { budget?: number }).budget ?? 0);
            }
            if (rule.type === 'dailyLimit' && limits.dailyLimit === undefined) {
                limits.dailyLimit = Number((rule.params as { limit?: number }).limit ?? 0);
            }
            if (rule.type === 'maxPerTransaction' && limits.maxPerTransaction === undefined) {
                limits.maxPerTransaction = Number((rule.params as { max?: number }).max ?? 0);
            }
        }
    }

    return limits;
}

function buildRecommendation(goalMonthly: number, analytics: SpendingAnalytics | null): Recommendation {
    const monthlyBudget = roundTwo(goalMonthly);
    const dailyLimit = roundTwo(Math.max(1, (monthlyBudget / 30) * 1.4));
    const maxPerTransaction = roundTwo(Math.max(0.5, dailyLimit * 0.6));

    const reasons: string[] = [];
    if (analytics) {
        const dailyPercent = analytics.daily.limit > 0 ? (analytics.daily.spent / analytics.daily.limit) * 100 : 0;
        const monthlyPercent = analytics.monthly.budget > 0 ? (analytics.monthly.spent / analytics.monthly.budget) * 100 : 0;
        if (dailyPercent > 100) {
            reasons.push(`You exceeded the daily limit by ${(dailyPercent - 100).toFixed(0)}%.`);
        } else if (dailyPercent > 80) {
            reasons.push(`You have used ${dailyPercent.toFixed(0)}% of today’s limit.`);
        }
        if (monthlyPercent > 80) {
            reasons.push(`Monthly spend is at ${monthlyPercent.toFixed(0)}% of budget.`);
        }
        reasons.push(
            `You spent ${formatUsd(analytics.monthly.spent)} USDC this month. Targeting ${formatUsd(monthlyBudget)} USDC keeps spend on goal.`
        );
    }
    reasons.push(`Daily limit set to ${formatUsd(dailyLimit)} USDC to keep month-end spend predictable.`);
    reasons.push(`Max per transaction set to ${formatUsd(maxPerTransaction)} USDC to prevent spikes.`);

    return {
        monthlyBudget,
        dailyLimit,
        maxPerTransaction,
        reasons,
        rules: [
            { type: 'monthlyBudget', params: { budget: monthlyBudget } },
            { type: 'dailyLimit', params: { limit: dailyLimit } },
            { type: 'maxPerTransaction', params: { max: maxPerTransaction } },
        ],
    };
}

export function AdvisorPanel({ refreshKey, userId, onApplied }: AdvisorPanelProps) {
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [analytics, setAnalytics] = useState<SpendingAnalytics | null>(null);
    const [goal, setGoal] = useState(DEFAULT_GOAL);
    const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [autoBudget, setAutoBudget] = useState(false);
    const autoAppliedRef = useRef(false);

    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            try {
                const [policyData, analyticsData, safety] = await Promise.all([
                    listPolicies(),
                    getSpendingAnalytics(userId),
                    getSafetyStatus(userId),
                ]);
                if (!active) return;
                setPolicies(policyData);
                setAnalytics(analyticsData);
                setAutoBudget(safety.autoBudget);
                setError(null);
            } catch (err) {
                if (!active) return;
                setError('Failed to load advisor context');
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => {
            active = false;
        };
    }, [refreshKey, userId]);

    const limits = useMemo(() => extractLimits(policies), [policies]);

    const handleGenerate = () => {
        const goalValue = Number(goal);
        if (!goal || Number.isNaN(goalValue) || goalValue <= 0) {
            setError('Enter a valid monthly budget');
            return;
        }
        setError(null);
        setStatus(null);
        setRecommendation(buildRecommendation(goalValue, analytics));
    };

    const applyRecommendation = useCallback(async (nextRecommendation: Recommendation) => {
        setApplying(true);
        setStatus(null);
        try {
            const target =
                policies.find((policy) => policy.name.toLowerCase().includes('spending')) ||
                policies[0];
            if (target) {
                await updatePolicy(target.id, { rules: nextRecommendation.rules, enabled: true });
            } else {
                await createPolicy({
                    name: 'Advisor Recommended Limits',
                    description: 'AutoWealth advisor recommended spending limits.',
                    rules: nextRecommendation.rules,
                });
            }
            setStatus('Policy updated. Guardrails will apply to new payments.');
            setRecommendation(null);
            onApplied?.();
        } catch (err) {
            setError('Failed to apply recommendation');
        } finally {
            setApplying(false);
        }
    }, [policies, onApplied]);

    const handleApply = async () => {
        if (!recommendation) return;
        await applyRecommendation(recommendation);
    };

    useEffect(() => {
        if (!autoBudget || !analytics || !analytics.warning || applying || autoAppliedRef.current) {
            return;
        }
        autoAppliedRef.current = true;
        const goalValue = Number(goal);
        const nextRecommendation = buildRecommendation(goalValue, analytics);
        setRecommendation(nextRecommendation);
        setStatus('Auto-budgeting triggered due to spend warning. Applying limits…');
        void applyRecommendation(nextRecommendation);
    }, [autoBudget, analytics, goal, applying, applyRecommendation]);

    useEffect(() => {
        if (!autoBudget) {
            autoAppliedRef.current = false;
        }
    }, [autoBudget]);

    return (
        <section className="panel advisor-panel">
            <div className="panel-header">
                <div>
                    <h3 className="panel-title">Advisor Review</h3>
                    <p className="panel-subtitle">Propose limits, review, then approve.</p>
                </div>
                <div className="panel-tags">
                    <span className="panel-tag">Review Required</span>
                    {autoBudget && <span className="panel-tag success">Auto-budgeting</span>}
                </div>
            </div>

            {loading && <div className="panel-muted">Loading advisor context…</div>}
            {error && <div className="panel-error">{error}</div>}

            <div className="advisor-form">
                <label>
                    Monthly AI spend goal (USDC)
                    <input
                        type="number"
                        min="1"
                        step="0.5"
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                    />
                </label>
                <button className="btn btn-secondary" onClick={handleGenerate} disabled={loading}>
                    Generate recommendation
                </button>
            </div>

            <div className="advisor-metrics">
                <div>
                    <span className="metric-label">Current monthly budget</span>
                    <span className="metric-value">
                        {limits.monthlyBudget ? `${formatUsd(limits.monthlyBudget)} USDC` : 'Not set'}
                    </span>
                </div>
                <div>
                    <span className="metric-label">Current daily limit</span>
                    <span className="metric-value">
                        {limits.dailyLimit ? `${formatUsd(limits.dailyLimit)} USDC` : 'Not set'}
                    </span>
                </div>
            </div>

            {recommendation && (
                <div className="recommendation-card">
                    <h4>Recommended guardrails</h4>
                    <ul>
                        <li>Monthly budget: {formatUsd(recommendation.monthlyBudget)} USDC</li>
                        <li>Daily limit: {formatUsd(recommendation.dailyLimit)} USDC</li>
                        <li>Max per transaction: {formatUsd(recommendation.maxPerTransaction)} USDC</li>
                    </ul>
                    <ul className="recommendation-reasons">
                        {recommendation.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                        ))}
                    </ul>
                    <button
                        className="btn btn-primary"
                        onClick={handleApply}
                        disabled={applying}
                    >
                        {applying ? 'Applying…' : 'Approve & apply policy'}
                    </button>
                </div>
            )}

            {status && <div className="panel-success">{status}</div>}
        </section>
    );
}
