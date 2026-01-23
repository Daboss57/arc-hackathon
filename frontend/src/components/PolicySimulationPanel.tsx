import { useState } from 'react';
import { validatePayment } from '../api/aiService';

interface PolicySimulationPanelProps {
    userId: string;
}

export function PolicySimulationPanel({ userId }: PolicySimulationPanelProps) {
    const [amount, setAmount] = useState('0.01');
    const [recipient, setRecipient] = useState('0x03972eb60d23a16edf247a521b83153ceb70f9e9');
    const [category, setCategory] = useState('x402-demo');
    const [approved, setApproved] = useState(false);
    const [result, setResult] = useState<{
        approved: boolean;
        blockedBy?: string;
        results: Array<{ passed: boolean; policyName: string; reason?: string }>;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSimulate = async () => {
        try {
            const data = await validatePayment(
                {
                    amount,
                    recipient,
                    category,
                    description: 'Policy simulation',
                    metadata: approved ? { approved: true } : undefined,
                },
                userId
            );
            setResult(data);
            setError(null);
        } catch (err) {
            setError('Simulation failed');
        }
    };

    return (
        <section className="panel simulation-panel">
            <div className="panel-header">
                <div>
                    <h3 className="panel-title">Policy Simulation</h3>
                    <p className="panel-subtitle">“If I approve this, what happens?”</p>
                </div>
            </div>

            <div className="simulation-form">
                <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Amount (USDC)"
                />
                <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="Recipient"
                />
                <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Category"
                />
                <label className="toggle-row inline">
                    <span>Assume user approved</span>
                    <input
                        type="checkbox"
                        checked={approved}
                        onChange={(e) => setApproved(e.target.checked)}
                    />
                </label>
                <button className="btn btn-secondary" onClick={handleSimulate}>
                    Run simulation
                </button>
            </div>

            {error && <div className="panel-error">{error}</div>}

            {result && (
                <div className={`simulation-result ${result.approved ? 'ok' : 'blocked'}`}>
                    <strong>{result.approved ? 'Approved' : `Blocked: ${result.blockedBy}`}</strong>
                    <ul>
                        {result.results.map((entry) => (
                            <li key={entry.policyName}>
                                {entry.policyName}: {entry.passed ? 'passed' : entry.reason || 'failed'}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
