import { useEffect, useMemo, useState } from 'react';
import { getSpendingAnalytics, listPolicies, type Policy, type SpendingAnalytics } from '../api/aiService';

interface AnalyticsPanelProps {
    refreshKey?: number;
    userId: string;
}

function formatUsd(value: number): string {
    return value.toFixed(2);
}

export function AnalyticsPanel({ refreshKey, userId }: AnalyticsPanelProps) {
    const [analytics, setAnalytics] = useState<SpendingAnalytics | null>(null);
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const [data, policyData] = await Promise.all([
                    getSpendingAnalytics(userId),
                    listPolicies(userId),
                ]);
                if (!active) return;
                setAnalytics(data);
                setPolicies(policyData);
                setError(null);
            } catch (err) {
                if (!active) return;
                setError('Failed to load analytics');
            }
        };
        load();
        return () => {
            active = false;
        };
    }, [refreshKey, userId]);

    const policyLimits = useMemo(() => {
        const limits: { daily?: number; monthly?: number } = {};
        for (const policy of policies) {
            const rules = Array.isArray(policy.rules) ? policy.rules : [];
            for (const rule of rules) {
                if (rule.type === 'dailyLimit' && limits.daily === undefined) {
                    limits.daily = Number((rule.params as { limit?: number }).limit ?? 0);
                }
                if (rule.type === 'monthlyBudget' && limits.monthly === undefined) {
                    limits.monthly = Number((rule.params as { budget?: number }).budget ?? 0);
                }
            }
        }
        return limits;
    }, [policies]);

    const dailyLimit = policyLimits.daily ?? analytics?.daily.limit ?? 0;
    const monthlyBudget = policyLimits.monthly ?? analytics?.monthly.budget ?? 0;
    const dailyPercent = analytics && dailyLimit > 0 ? (analytics.daily.spent / dailyLimit) * 100 : 0;
    const monthlyPercent = analytics && monthlyBudget > 0 ? (analytics.monthly.spent / monthlyBudget) * 100 : 0;

    return (
        <section className="panel analytics-panel">
            <div className="panel-header">
                <div>
                    <h3 className="panel-title">Spend Analytics</h3>
                    <p className="panel-subtitle">Live view of budget usage.</p>
                </div>
            </div>

            {error && <div className="panel-error">{error}</div>}
            {!analytics && !error && <div className="panel-muted">Loading analytics…</div>}

            {analytics && (
                <div className="analytics-body">
                    <div className="metric-block">
                        <div className="metric-header">
                            <span>Daily spend</span>
                            <strong>
                                {formatUsd(analytics.daily.spent)} / {formatUsd(dailyLimit)} USDC
                                <em>{dailyPercent > 0 ? ` · ${dailyPercent.toFixed(0)}%` : ''}</em>
                            </strong>
                        </div>
                        <div className="progress">
                            <div
                                className="progress-bar"
                                style={{ width: `${Math.min(dailyPercent, 100)}%` }}
                            />
                        </div>
                        <span className="metric-foot">
                            {formatUsd(Math.max(dailyLimit - analytics.daily.spent, 0))} USDC remaining today
                        </span>
                    </div>

                    <div className="metric-block">
                        <div className="metric-header">
                            <span>Monthly spend</span>
                            <strong>
                                {formatUsd(analytics.monthly.spent)} / {formatUsd(monthlyBudget)} USDC
                                <em>{monthlyPercent > 0 ? ` · ${monthlyPercent.toFixed(0)}%` : ''}</em>
                            </strong>
                        </div>
                        <div className="progress">
                            <div
                                className="progress-bar warning"
                                style={{ width: `${Math.min(monthlyPercent, 100)}%` }}
                            />
                        </div>
                        <span className="metric-foot">
                            {formatUsd(Math.max(monthlyBudget - analytics.monthly.spent, 0))} USDC remaining this month
                        </span>
                    </div>

                    <div className="category-list">
                        <span className="metric-label">Top categories</span>
                        {Object.entries(analytics.byCategory).length === 0 && (
                            <span className="panel-muted">No category spend yet.</span>
                        )}
                        {Object.entries(analytics.byCategory).map(([category, amount]) => (
                            <div key={category} className="category-row">
                                <span>{category}</span>
                                <strong>{formatUsd(amount)} USDC</strong>
                            </div>
                        ))}
                    </div>

                    {analytics.warning && <div className="warning-banner">⚠️ {analytics.warning}</div>}
                </div>
            )}
        </section>
    );
}
