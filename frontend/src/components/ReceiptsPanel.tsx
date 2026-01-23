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
                {transactions.map((tx) => (
                    <div key={tx.id} className={`receipt-item ${tx.status}`}>
                        <div>
                            <div className="receipt-header">
                                <strong>{tx.amount} USDC</strong>
                                <span className={`status-pill ${tx.status}`}>{tx.status}</span>
                            </div>
                            <div className="receipt-meta">
                                <span>{tx.category || 'uncategorized'}</span>
                                <span title={tx.txHash}>{truncateHash(tx.txHash)}</span>
                            </div>
                            {tx.policy && (
                                <div className="receipt-policy">
                                    Policy: {tx.policy.appliedPolicies.join(', ') || 'Approved'}
                                </div>
                            )}
                        </div>
                        <div className="receipt-date">
                            {new Date(tx.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
