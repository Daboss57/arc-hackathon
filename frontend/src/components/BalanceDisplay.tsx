import { useEffect, useRef, useState } from 'react';
import { getBalance, type TreasuryBalance } from '../api/aiService';

interface BalanceDisplayProps {
    refreshTrigger?: number;
}

export function BalanceDisplay({ refreshTrigger }: BalanceDisplayProps) {
    const [balance, setBalance] = useState<TreasuryBalance | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [animate, setAnimate] = useState(false);
    const lastAmountRef = useRef<string | null>(null);

    useEffect(() => {
        const fetchBalance = async () => {
            try {
                const data = await getBalance(Boolean(refreshTrigger));
                setBalance(data);
                setError(null);
            } catch (err) {
                setError('Failed to load balance');
                console.error(err);
            }
        };

        fetchBalance();
    }, [refreshTrigger]);

    useEffect(() => {
        if (!balance?.amount) return;
        if (lastAmountRef.current && lastAmountRef.current !== balance.amount) {
            setAnimate(true);
            const timeout = window.setTimeout(() => setAnimate(false), 500);
            lastAmountRef.current = balance.amount;
            return () => window.clearTimeout(timeout);
        }
        lastAmountRef.current = balance.amount;
    }, [balance?.amount]);

    if (error) {
        return (
            <div className="balance-display error">
                <span className="balance-icon">⚠️</span>
                <span className="balance-error">{error}</span>
            </div>
        );
    }

    if (!balance) {
        return (
            <div className="balance-display loading">
                <span className="balance-icon">💰</span>
                <span className="balance-amount">Loading...</span>
            </div>
        );
    }

    return (
        <div className={`balance-display ${animate ? 'balance-updated' : ''}`}>
            <span className="balance-icon">💰</span>
            <div className="balance-info">
                <span className="balance-amount">{balance.amount} {balance.currency}</span>
                <span className="balance-label">Treasury Balance</span>
            </div>
        </div>
    );
}
