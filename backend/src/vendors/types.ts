export interface Product {
    id: string;
    name: string;
    description: string;
    price: string; // USDC amount
    stock: number;
    imageUrl?: string;
}

export interface Vendor {
    id: string;
    name: string;
    category: string;
    description: string;
    wallet: string; // Vendor's receiving address
    products: Product[];
}

export interface Order {
    orderId: string;
    vendorId: string;
    productId: string;
    product: Product;
    txHash: string;
    status: 'confirmed' | 'pending' | 'failed';
    createdAt: Date;
}
