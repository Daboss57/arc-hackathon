import { v4 as uuid } from 'uuid';
import { logger } from '../lib/logger.js';
import { evaluateRule } from './rules.js';
import type { Policy, PaymentContext, PolicyValidationResult, ValidationSummary, Rule } from './types.js';

const policies: Map<string, Policy> = new Map();

export function createPolicy(data: { name: string; description?: string; rules: Rule[] }): Policy {
    const policy: Policy = {
        id: uuid(),
        name: data.name,
        description: data.description,
        enabled: true,
        rules: data.rules,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    policies.set(policy.id, policy);
    logger.info('Policy created', { policyId: policy.id, name: policy.name });
    return policy;
}

export function getPolicy(id: string): Policy | undefined {
    return policies.get(id);
}

export function listPolicies(): Policy[] {
    return Array.from(policies.values());
}

export function updatePolicy(id: string, updates: Partial<Pick<Policy, 'name' | 'description' | 'enabled' | 'rules'>>): Policy | null {
    const policy = policies.get(id);
    if (!policy) return null;

    Object.assign(policy, updates, { updatedAt: new Date() });
    return policy;
}

export function deletePolicy(id: string): boolean {
    return policies.delete(id);
}

export async function validatePayment(ctx: PaymentContext): Promise<ValidationSummary> {
    const results: PolicyValidationResult[] = [];
    let approved = true;
    let blockedBy: string | undefined;

    for (const policy of policies.values()) {
        if (!policy.enabled) continue;

        let policyPassed = true;
        let failedRule: PolicyValidationResult['failedRule'];
        let reason: string | undefined;

        for (const rule of policy.rules) {
            const result = await evaluateRule(rule, ctx);
            if (!result.passed) {
                policyPassed = false;
                failedRule = rule.type;
                reason = result.reason;
                break;
            }
        }

        results.push({
            passed: policyPassed,
            policyId: policy.id,
            policyName: policy.name,
            failedRule,
            reason,
        });

        if (!policyPassed) {
            approved = false;
            blockedBy = policy.name;
        }
    }

    if (!approved) {
        logger.warn('Payment blocked by policy', { blockedBy, amount: ctx.amount, recipient: ctx.recipient });
    }

    return { approved, results, blockedBy };
}

export function seedDefaultPolicies(): void {
    if (policies.size > 0) return;

    createPolicy({
        name: 'Default Spending Limits',
        description: 'Basic safety limits for autonomous spending',
        rules: [
            { type: 'maxPerTransaction', params: { max: 10 } },
            { type: 'dailyLimit', params: { limit: 50 } },
            { type: 'monthlyBudget', params: { budget: 200 } },
        ],
    });

    logger.info('Seeded default policies');
}
