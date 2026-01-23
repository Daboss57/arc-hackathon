import { useEffect, useState } from 'react';
import { BACKEND_URL, getSafetyStatus, x402Fetch, type X402FetchResult } from '../api/aiService';

interface X402DemoPanelProps {
    userId: string;
    onPaymentComplete?: () => void;
}

export function X402DemoPanel({ userId, onPaymentComplete }: X402DemoPanelProps) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [result, setResult] = useState<X402FetchResult | null>(null);
    const [approvalRequired, setApprovalRequired] = useState(false);

    useEffect(() => {
        let active = true;
        const loadSafety = async () => {
            try {
                const safety = await getSafetyStatus(userId);
                if (!active) return;
                setApprovalRequired(safety.approvalRequired);
            } catch {
                if (active) setApprovalRequired(false);
            }
        };
        loadSafety();
        return () => {
            active = false;
        };
    }, [userId]);

    const handleRun = async (approved?: boolean) => {
        setStatus('loading');
        setResult(null);
        try {
            const response = await x402Fetch({
                url: `${BACKEND_URL}/api/payments/x402/demo/paid-content`,
                category: 'x402-demo',
                userId,
                metadata: approved ? { approved: true } : undefined,
            });
            setResult(response);
            setStatus(response.success ? 'success' : 'error');
            if (response.success && response.paymentMade) {
                onPaymentComplete?.();
            }
            if (response.success && approved) {
                setApprovalRequired(false);
            }
            if (response.policyBlocked && response.error?.toLowerCase().includes('safe mode')) {
                setApprovalRequired(true);
            }
        } catch (err) {
            setStatus('error');
            setResult({ success: false, error: 'x402 demo failed' });
        }
    };

    return (
        <section className="panel x402-panel">
            <div className="panel-header">
                <div>
                    <h3 className="panel-title">x402 Micropayment Demo</h3>
                    <p className="panel-subtitle">Agent pays per-use to unlock a paid API.</p>
                </div>
            </div>

            <div className="x402-steps">
                <span>1. Request paid endpoint</span>
                <span>2. Receive 402 + payment terms</span>
                <span>3. Pay with USDC via Arc + Circle</span>
            </div>

            <button className="btn btn-primary" onClick={() => handleRun()} disabled={status === 'loading'}>
                {status === 'loading' ? 'Processing…' : 'Run paid API call'}
            </button>

            {approvalRequired && (
                <button className="btn btn-secondary" onClick={() => handleRun(true)} disabled={status === 'loading'}>
                    Approve first payment
                </button>
            )}

            {result && (
                <div className={`x402-result ${status}`}>
                    {result.success ? (
                        <>
                            <div className="x402-success">✅ Payment complete</div>
                            {result.paymentAmount && (
                                <div>Paid: {result.paymentAmount} USDC</div>
                            )}
                            {result.txHash && (
                                <div className="x402-hash">Tx: {result.txHash}</div>
                            )}
                            <pre>{JSON.stringify(result.data, null, 2)}</pre>
                        </>
                    ) : (
                        <div className="x402-error">❌ {result.error || 'Payment failed'}</div>
                    )}
                </div>
            )}
        </section>
    );
}
