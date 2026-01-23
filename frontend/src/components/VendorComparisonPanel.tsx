import { useMemo, useState } from 'react';

interface Provider {
    id: string;
    name: string;
    price: number; // USDC per 1k tokens
    quality: number; // 0-100
    latency: number; // ms
    note: string;
}

const PROVIDERS: Provider[] = [
    {
        id: 'provider-a',
        name: 'Provider A',
        price: 0.25,
        quality: 78,
        latency: 280,
        note: 'Balanced quality, strong reliability.',
    },
    {
        id: 'provider-b',
        name: 'Provider B',
        price: 0.18,
        quality: 70,
        latency: 320,
        note: 'Lowest cost, acceptable quality.',
    },
    {
        id: 'provider-c',
        name: 'Provider C',
        price: 0.32,
        quality: 88,
        latency: 210,
        note: 'Highest quality, premium pricing.',
    },
];

export function VendorComparisonPanel() {
    const [preference, setPreference] = useState(40);

    const scored = useMemo(() => {
        const maxPrice = Math.max(...PROVIDERS.map((provider) => provider.price));
        const minPrice = Math.min(...PROVIDERS.map((provider) => provider.price));
        const normalizePrice = (price: number) => {
            if (maxPrice === minPrice) return 1;
            return 1 - (price - minPrice) / (maxPrice - minPrice);
        };

        const weightQuality = preference / 100;
        const weightSavings = 1 - weightQuality;

        return PROVIDERS.map((provider) => {
            const savingsScore = normalizePrice(provider.price) * 100;
            const score = provider.quality * weightQuality + savingsScore * weightSavings;
            return { ...provider, score: Math.round(score) };
        }).sort((a, b) => b.score - a.score);
    }, [preference]);

    const best = scored[0];

    return (
        <section className="panel provider-panel">
            <div className="panel-header">
                <div>
                    <h3 className="panel-title">Provider Comparison</h3>
                    <p className="panel-subtitle">Goal-driven purchasing for AI APIs.</p>
                </div>
            </div>

            <div className="slider-row">
                <span>Maximize savings</span>
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={preference}
                    onChange={(e) => setPreference(Number(e.target.value))}
                />
                <span>Maximize quality</span>
            </div>

            <div className="provider-list">
                {scored.map((provider) => (
                    <div key={provider.id} className={`provider-card ${provider.id === best.id ? 'selected' : ''}`}>
                        <div className="provider-header">
                            <strong>{provider.name}</strong>
                            <span className="score-pill">{provider.score} score</span>
                        </div>
                        <div className="provider-metrics">
                            <span>{provider.price} USDC / 1k tokens</span>
                            <span>Quality {provider.quality}</span>
                            <span>Latency {provider.latency}ms</span>
                        </div>
                        <p>{provider.note}</p>
                    </div>
                ))}
            </div>

            <div className="provider-choice">
                <strong>Chosen: {best.name}</strong>
                <span>
                    {best.price} USDC with quality {best.quality}. Policy will favor this option under current goal.
                </span>
            </div>
        </section>
    );
}
