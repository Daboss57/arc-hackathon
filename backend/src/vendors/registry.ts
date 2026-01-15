/**
 * Mock Vendor Registry
 * Contains fake vendors with products for hackathon demo
 */

import type { Vendor } from './types.js';

// All vendors receive payments at this demo address
const DEMO_VENDOR_WALLET = '0x03972eb60d23a16edf247a521b83153ceb70f9e9';

export const vendors: Record<string, Vendor> = {
    techstore: {
        id: 'techstore',
        name: 'TechStore',
        category: 'electronics',
        description: 'Premium electronics and gadgets',
        wallet: DEMO_VENDOR_WALLET,
        products: [
            {
                id: 'ts-001',
                name: 'Wireless Earbuds Pro',
                description: 'High-quality wireless earbuds with noise cancellation',
                price: '0.30', // Demo prices in small USDC amounts
                stock: 10,
            },
            {
                id: 'ts-002',
                name: 'USB-C Hub 7-in-1',
                description: 'Multi-port adapter with HDMI, USB-A, SD card slots',
                price: '0.50',
                stock: 5,
            },
            {
                id: 'ts-003',
                name: 'Phone Stand Adjustable',
                description: 'Aluminum phone/tablet stand with adjustable angle',
                price: '0.20',
                stock: 15,
            },
            {
                id: 'ts-004',
                name: 'Portable Charger 10000mAh',
                description: 'Fast-charging power bank with dual USB ports',
                price: '0.35',
                stock: 8,
            },
        ],
    },

    bookmart: {
        id: 'bookmart',
        name: 'BookMart',
        category: 'books',
        description: 'Digital and physical books for every reader',
        wallet: DEMO_VENDOR_WALLET,
        products: [
            {
                id: 'bm-001',
                name: 'AI & Machine Learning Guide',
                description: 'Comprehensive guide to modern AI techniques',
                price: '0.25',
                stock: 100,
            },
            {
                id: 'bm-002',
                name: 'Clean Code Handbook',
                description: 'Best practices for writing maintainable code',
                price: '0.35',
                stock: 50,
            },
            {
                id: 'bm-003',
                name: 'The Crypto Economy',
                description: 'Understanding blockchain and digital currencies',
                price: '0.20',
                stock: 75,
            },
        ],
    },

    fashionhub: {
        id: 'fashionhub',
        name: 'FashionHub',
        category: 'clothing',
        description: 'Trendy apparel and accessories',
        wallet: DEMO_VENDOR_WALLET,
        products: [
            {
                id: 'fh-001',
                name: 'Developer T-Shirt',
                description: 'Comfortable cotton tee with coding theme',
                price: '0.25',
                stock: 20,
            },
            {
                id: 'fh-002',
                name: 'Tech Hoodie',
                description: 'Warm hoodie with minimalist design',
                price: '0.55',
                stock: 10,
            },
            {
                id: 'fh-003',
                name: 'Snapback Cap',
                description: 'Adjustable cap with embroidered logo',
                price: '0.18',
                stock: 30,
            },
        ],
    },

    grocerygo: {
        id: 'grocerygo',
        name: 'GroceryGo',
        category: 'food',
        description: 'Fresh groceries and snacks delivered',
        wallet: DEMO_VENDOR_WALLET,
        products: [
            {
                id: 'gg-001',
                name: 'Premium Snack Box',
                description: 'Assorted healthy snacks for the week',
                price: '0.13',
                stock: 25,
            },
            {
                id: 'gg-002',
                name: 'Artisan Coffee Pack',
                description: 'Specialty coffee beans, 500g',
                price: '0.23',
                stock: 15,
            },
            {
                id: 'gg-003',
                name: 'Energy Bar Bundle',
                description: '12-pack of protein energy bars',
                price: '0.10',
                stock: 40,
            },
        ],
    },
};

export function getVendor(vendorId: string): Vendor | undefined {
    return vendors[vendorId];
}

export function getAllVendors(): Vendor[] {
    return Object.values(vendors);
}

export function getProduct(vendorId: string, productId: string) {
    const vendor = vendors[vendorId];
    if (!vendor) return undefined;
    return vendor.products.find(p => p.id === productId);
}

export function searchProducts(query: string): Array<{ vendor: Vendor; product: typeof vendors.techstore.products[0] }> {
    const results: Array<{ vendor: Vendor; product: typeof vendors.techstore.products[0] }> = [];
    const lowerQuery = query.toLowerCase();

    for (const vendor of Object.values(vendors)) {
        for (const product of vendor.products) {
            if (
                product.name.toLowerCase().includes(lowerQuery) ||
                product.description.toLowerCase().includes(lowerQuery) ||
                vendor.category.toLowerCase().includes(lowerQuery)
            ) {
                results.push({ vendor, product });
            }
        }
    }

    return results;
}
