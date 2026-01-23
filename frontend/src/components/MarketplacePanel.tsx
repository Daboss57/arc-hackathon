import { useEffect, useState } from 'react';
import { BACKEND_URL, listVendorProducts, listVendors, x402Fetch, type VendorProduct, type VendorSummary } from '../api/aiService';

interface MarketplacePanelProps {
    userId: string;
    onPurchase?: () => void;
}

export function MarketplacePanel({ userId, onPurchase }: MarketplacePanelProps) {
    const [vendors, setVendors] = useState<VendorSummary[]>([]);
    const [selectedVendor, setSelectedVendor] = useState<VendorSummary | null>(null);
    const [products, setProducts] = useState<VendorProduct[]>([]);
    const [status, setStatus] = useState<string | null>(null);
    const [pendingApproval, setPendingApproval] = useState<{ vendorId: string; productId: string } | null>(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const data = await listVendors();
                if (!active) return;
                setVendors(data);
                setSelectedVendor(data[0] || null);
            } catch {
                if (active) setStatus('Failed to load vendors.');
            }
        };
        load();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        if (!selectedVendor) return;
        const loadProducts = async () => {
            try {
                const data = await listVendorProducts(selectedVendor.id);
                if (!active) return;
                setProducts(data.products);
            } catch {
                if (active) setStatus('Failed to load products.');
            }
        };
        loadProducts();
        return () => {
            active = false;
        };
    }, [selectedVendor]);

    const runPurchase = async (vendorId: string, productId: string, approved?: boolean) => {
        setStatus('Processing purchase…');
        const url = `${BACKEND_URL}/api/vendors/${vendorId}/purchase/${productId}`;
        const result = await x402Fetch({
            url,
            method: 'POST',
            category: 'vendor-purchase',
            userId,
            metadata: approved ? { approved: true } : undefined,
        });

        if (!result.success && result.policyBlocked && result.error?.toLowerCase().includes('safe mode')) {
            setPendingApproval({ vendorId, productId });
            setStatus('Safe mode: approval required for first purchase.');
            return;
        }

        if (!result.success) {
            setStatus(result.error || 'Purchase failed.');
            return;
        }

        setPendingApproval(null);
        setStatus('Purchase confirmed. Receipt recorded.');
        onPurchase?.();
    };

    return (
        <section className="panel marketplace-panel">
            <div className="panel-header">
                <div>
                    <h3 className="panel-title">Autonomous Marketplace</h3>
                    <p className="panel-subtitle">Discover vendors and purchase with x402.</p>
                </div>
            </div>

            <div className="marketplace-vendors">
                {vendors.length === 0 && <span className="panel-muted">No vendors available.</span>}
                {vendors.map((vendor) => (
                    <button
                        key={vendor.id}
                        className={`vendor-chip ${selectedVendor?.id === vendor.id ? 'active' : ''}`}
                        onClick={() => setSelectedVendor(vendor)}
                    >
                        {vendor.name}
                    </button>
                ))}
            </div>

            <div className="marketplace-products">
                {products.map((product) => (
                    <div key={product.id} className="product-row">
                        <div>
                            <strong>{product.name}</strong>
                            <span>{product.description}</span>
                        </div>
                        <div className="product-meta">
                            <span>{product.price} USDC</span>
                            <button
                                className="btn btn-secondary small"
                                onClick={() => runPurchase(selectedVendor?.id || '', product.id)}
                                disabled={!selectedVendor}
                            >
                                Buy
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {pendingApproval && (
                <button
                    className="btn btn-primary"
                    onClick={() => runPurchase(pendingApproval.vendorId, pendingApproval.productId, true)}
                >
                    Approve first purchase
                </button>
            )}

            {status && <div className="panel-muted">{status}</div>}
        </section>
    );
}
