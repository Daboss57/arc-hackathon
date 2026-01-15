import { Router } from 'express';
import { getAllVendors, getVendor, getProduct, searchProducts } from '../../vendors/registry.js';
import type { Order } from '../../vendors/types.js';

const router = Router();

// In-memory order storage for demo
const orders: Order[] = [];

/**
 * GET /api/vendors
 * List all vendors (FREE)
 */
router.get('/', (_req, res) => {
    const vendors = getAllVendors().map(v => ({
        id: v.id,
        name: v.name,
        category: v.category,
        description: v.description,
        productCount: v.products.length,
    }));
    res.json({ vendors });
});

/**
 * GET /api/vendors/search?q=query
 * Search products across all vendors (FREE)
 */
router.get('/search', (req, res) => {
    const query = req.query.q as string;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const results = searchProducts(query);
    res.json({
        query,
        results: results.map(r => ({
            vendorId: r.vendor.id,
            vendorName: r.vendor.name,
            product: r.product,
        })),
    });
});

/**
 * GET /api/vendors/:vendorId
 * Get vendor info (FREE)
 */
router.get('/:vendorId', (req, res) => {
    const vendor = getVendor(req.params.vendorId);
    if (!vendor) {
        return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json({
        id: vendor.id,
        name: vendor.name,
        category: vendor.category,
        description: vendor.description,
        wallet: vendor.wallet,
        productCount: vendor.products.length,
    });
});

/**
 * GET /api/vendors/:vendorId/products
 * List vendor products (FREE)
 */
router.get('/:vendorId/products', (req, res) => {
    const vendor = getVendor(req.params.vendorId);
    if (!vendor) {
        return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json({
        vendorId: vendor.id,
        vendorName: vendor.name,
        products: vendor.products,
    });
});

/**
 * GET /api/vendors/:vendorId/products/:productId
 * Get product details (FREE)
 */
router.get('/:vendorId/products/:productId', (req, res) => {
    const { vendorId, productId } = req.params;
    const vendor = getVendor(vendorId);
    if (!vendor) {
        return res.status(404).json({ error: 'Vendor not found' });
    }

    const product = getProduct(vendorId, productId);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
        vendorId: vendor.id,
        vendorName: vendor.name,
        vendorWallet: vendor.wallet,
        product,
    });
});

/**
 * POST /api/vendors/:vendorId/purchase/:productId
 * Purchase a product (x402 - requires payment)
 */
router.post('/:vendorId/purchase/:productId', (req, res) => {
    const { vendorId, productId } = req.params;
    const paymentHeader = req.headers['x-payment'];

    const vendor = getVendor(vendorId);
    if (!vendor) {
        return res.status(404).json({ error: 'Vendor not found' });
    }

    const product = getProduct(vendorId, productId);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }

    // Check stock
    if (product.stock <= 0) {
        return res.status(400).json({ error: 'Product out of stock' });
    }

    // If no payment, return 402 Payment Required
    if (!paymentHeader) {
        const paymentRequirements = {
            amount: product.price,
            recipient: vendor.wallet,
            network: 'eip155:1620', // Arc testnet
            resource: `/api/vendors/${vendorId}/purchase/${productId}`,
            productName: product.name,
            vendorName: vendor.name,
        };

        res.setHeader(
            'x-payment-required',
            Buffer.from(JSON.stringify(paymentRequirements)).toString('base64')
        );

        return res.status(402).json({
            error: 'Payment Required',
            paymentRequirements,
            message: `This purchase requires ${product.price} USDC`,
        });
    }

    // Payment received - parse proof and create order
    let paymentProof: { txHash?: string; from?: string; amount?: string };
    try {
        paymentProof = JSON.parse(Buffer.from(paymentHeader as string, 'base64').toString());
    } catch {
        return res.status(400).json({ error: 'Invalid payment header' });
    }

    // Create order
    const order: Order = {
        orderId: `order_${Date.now().toString(36)}`,
        vendorId,
        productId,
        product,
        txHash: paymentProof.txHash || 'unknown',
        status: 'confirmed',
        createdAt: new Date(),
    };

    orders.push(order);

    // Decrease stock (demo only)
    product.stock -= 1;

    res.json({
        success: true,
        order: {
            orderId: order.orderId,
            status: order.status,
            product: {
                name: product.name,
                price: product.price,
            },
            vendor: vendor.name,
            txHash: order.txHash,
            message: `Thank you for your purchase from ${vendor.name}!`,
        },
    });
});

/**
 * GET /api/vendors/orders
 * List all orders (for demo inspection)
 */
router.get('/orders/all', (_req, res) => {
    res.json({ orders });
});

export default router;
