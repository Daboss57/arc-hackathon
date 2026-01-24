import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Transaction {
    id: string;
    user_id: string;
    tx_hash?: string;
    from_address?: string;
    to_address: string;
    amount: number;
    currency: string;
    status: string;
    category?: string;
    description?: string;
    vendor_name?: string;
    product_name?: string;
    order_id?: string;
    policy_result?: {
        approved: boolean;
        appliedPolicies?: string[];
        blockedBy?: string;
    };
    created_at: string;
    confirmed_at?: string;
}

interface ReceiptsPanelProps {
    refreshKey?: number;
    userId: string;
}

function truncateHash(hash?: string): string {
    if (!hash) return 'N/A';
    if (hash.length <= 12) return hash;
    return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export function ReceiptsPanel({ refreshKey, userId }: ReceiptsPanelProps) {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) return;
        let active = true;
        
        const load = async () => {
            try {
                const { data, error: fetchError } = await supabase
                    .from('transactions')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(20);
                
                if (fetchError) throw fetchError;
                if (!active) return;
                setTransactions(data || []);
                setError(null);
            } catch (err) {
                if (!active) return;
                console.error('Failed to load receipts:', err);
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
                    <p className="panel-subtitle">Audit trail of every payment.</p>
                </div>
            </div>

            {error && <div className="panel-error">{error}</div>}
            {!error && transactions.length === 0 && (
                <div className="panel-muted">No transactions yet.</div>
            )}

            <div className="receipt-list">
                {transactions.map((tx) => {
                    const isExpanded = expandedId === tx.id;
                    const policyLabel = tx.policy_result
                        ? tx.policy_result.approved
                            ? `Approved${tx.policy_result.appliedPolicies?.length ? ` (${tx.policy_result.appliedPolicies.join(', ')})` : ''}`
                            : `Blocked by ${tx.policy_result.blockedBy || 'Policy'}`
                        : 'N/A';
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
                                <strong>{tx.amount} {tx.currency}</strong>
                                <span className={`status-pill ${tx.status}`}>{tx.status}</span>
                            </div>
                            {(tx.product_name || tx.vendor_name) && (
                                <div className="receipt-product">
                                    {tx.product_name}{tx.vendor_name ? ` • ${tx.vendor_name}` : ''}
                                </div>
                            )}
                            <div className="receipt-meta">
                                <span>{tx.category || 'uncategorized'}</span>
                                {tx.order_id && <span>Order: {tx.order_id}</span>}
                            </div>
                        </div>
                        <div className="receipt-date">
                            {new Date(tx.created_at).toLocaleDateString()}
                        </div>
                        {isExpanded && (
                            <div className="receipt-details">
                                <div><strong>Time:</strong> {new Date(tx.created_at).toLocaleString()}</div>
                                <div><strong>To:</strong> {tx.to_address}</div>
                                {tx.tx_hash && <div><strong>Tx Hash:</strong> {tx.tx_hash}</div>}
                                {tx.description && <div><strong>Description:</strong> {tx.description}</div>}
                                <div><strong>Policy:</strong> {policyLabel}</div>
                                {tx.confirmed_at && (
                                    <div><strong>Confirmed:</strong> {new Date(tx.confirmed_at).toLocaleString()}</div>
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
