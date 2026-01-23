import { useEffect, useState } from 'react';
import { getTransactionHistory, type Transaction } from '../api/aiService';

interface ReceiptsPanelProps {
    refreshKey?: number;
    userId: string;
}

function truncateHash(hash: string): string {
    if (!hash) return 'Pending';
    if (hash.length <= 12) return hash;
    return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export function ReceiptsPanel({ refreshKey, userId }: ReceiptsPanelProps) {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const data = await getTransactionHistory({ limit: 8 }, userId);
                if (!active) return;
                setTransactions(data);
                setError(null);
            } catch (err) {
                if (!active) return;
                setError('Failed to load receipts');
            }
        };
        load();
        return () => {
            active = false;
        };
    }, [refreshKey, userId]);

    return (
        <section className="panel receipts-panel">
            <div className="panel-header">
                <div>
                    <h3 className="panel-title">Receipts & Proof</h3>
                    <p className="panel-subtitle">Audit trail of every onchain payment.</p>
                </div>
            </div>

            {error && <div className="panel-error">{error}</div>}
            {!error && transactions.length === 0 && (
                <div className="panel-muted">No payments yet. Run a demo purchase to populate receipts.</div>
            )}

            <div className="receipt-list">
                {transactions.map((tx) => {
                    const isExpanded = expandedId === tx.id;
                    const policyLabel = tx.policy
                        ? tx.policy.approved
                            ? `Approved (${tx.policy.appliedPolicies.join(', ') || 'Policies'})`
                            : `Blocked by ${tx.policy.blockedBy || 'Policy'}`
                        : 'No policy data';
                    return (
                    <div
                        key={tx.id}
                        className={`receipt-item ${tx.status} ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                setExpandedId(isExpanded ? null : tx.id);
                            }
                        }}
                    >
                        <div>
                            <div className="receipt-header">
                                <strong>{tx.amount} USDC</strong>
                                <span className={`status-pill ${tx.status}`}>{tx.status}</span>
                            </div>
                            <div className="receipt-meta">
                                <span>{tx.category || 'uncategorized'}</span>
                                <span title={tx.txHash}>{truncateHash(tx.txHash)}</span>
                            </div>
                            <div className="receipt-policy">
                                Policy: {policyLabel}
                            </div>
                        </div>
                        <div className="receipt-date">
                            {new Date(tx.createdAt).toLocaleDateString()}
                        </div>
                        {isExpanded && (
                            <div className="receipt-details">
                                <div><strong>Time:</strong> {new Date(tx.createdAt).toLocaleString()}</div>
                                <div><strong>From:</strong> {tx.from}</div>
                                <div><strong>To:</strong> {tx.to}</div>
                                <div><strong>Tx Hash:</strong> {tx.txHash || 'Pending'}</div>
                                {tx.description && <div><strong>Description:</strong> {tx.description}</div>}
                                {tx.confirmedAt && (
                                    <div><strong>Confirmed:</strong> {new Date(tx.confirmedAt).toLocaleString()}</div>
                                )}
                            </div>
                        )}
                    </div>
                    );
                })}
            </div>
        </section>
    );
}
