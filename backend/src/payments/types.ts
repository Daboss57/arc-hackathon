export interface X402PaymentRequired {
    scheme: string;
    network: string;
    recipient: string;
    amount: string;
    currency: string;
    resource: string;
    description?: string;
}

export interface X402PaymentPayload {
    scheme: string;
    network: string;
    payload: {
        signature: string;
        authorization: {
            from: string;
            to: string;
            value: string;
            validAfter: number;
            validBefore: number;
            nonce: string;
        };
    };
}

export interface PaymentRequest {
    recipient: string;
    amount: string;
    category?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    userId?: string;
}

export interface PaymentResult {
    paymentId: string;
    status: 'pending' | 'completed' | 'failed';
    txHash?: string;
    error?: string;
    policyResult: {
        passed: boolean;
        appliedRules: string[];
        blockedBy?: string;
    };
}
