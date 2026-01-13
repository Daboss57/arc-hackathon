export type RuleType =
    | 'maxPerTransaction'
    | 'dailyLimit'
    | 'monthlyBudget'
    | 'vendorWhitelist'
    | 'categoryLimit';

export interface Rule {
    type: RuleType;
    params: Record<string, unknown>;
}

export interface Policy {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    rules: Rule[];
    createdAt: Date;
    updatedAt: Date;
}

export interface PolicyValidationResult {
    passed: boolean;
    policyId: string;
    policyName: string;
    failedRule?: RuleType;
    reason?: string;
}

export interface PaymentContext {
    amount: string;
    recipient: string;
    category?: string;
    description?: string;
    metadata?: Record<string, unknown>;
}

export interface ValidationSummary {
    approved: boolean;
    results: PolicyValidationResult[];
    blockedBy?: string;
}
