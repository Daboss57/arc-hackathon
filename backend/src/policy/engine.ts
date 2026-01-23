import { v4 as uuid } from 'uuid';
import { logger } from '../lib/logger.js';
import { evaluateRule } from './rules.js';
import { getPolicies, setPolicies } from '../lib/dataStore.js';
import { hasUserApprovedOnce, isPaymentsPaused, isSafeModeEnabled, markUserApprovedOnce } from '../lib/safety.js';
import type { Policy, PaymentContext, PolicyValidationResult, ValidationSummary, Rule } from './types.js';

const policies: Map<string, Policy> = new Map();

export function loadPoliciesFromStore(): void {
    const stored = getPolicies();
    policies.clear();
    for (const policy of stored) {
        if (!policy || typeof policy.name !== 'string' || !Array.isArray(policy.rules)) {
            logger.warn('Skipping invalid policy from store', { policyId: policy?.id });
            continue;
        }
        policies.set(policy.id, policy);
    }
    persistPolicies();
}

function persistPolicies(): void {
    setPolicies(Array.from(policies.values()));
}

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
    persistPolicies();
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

    const sanitized: Partial<Pick<Policy, 'name' | 'description' | 'enabled' | 'rules'>> = {};
    if (updates.name !== undefined) sanitized.name = updates.name;
    if (updates.description !== undefined) sanitized.description = updates.description;
    if (updates.enabled !== undefined) sanitized.enabled = updates.enabled;
    if (updates.rules !== undefined) sanitized.rules = updates.rules;

    Object.assign(policy, sanitized, { updatedAt: new Date() });
    persistPolicies();
    return policy;
}

export function deletePolicy(id: string): boolean {
    const deleted = policies.delete(id);
    if (deleted) persistPolicies();
    return deleted;
}

export async function validatePayment(ctx: PaymentContext): Promise<ValidationSummary> {
    if (isPaymentsPaused()) {
        return {
            approved: false,
            blockedBy: 'Kill Switch',
            results: [
                {
                    passed: false,
                    policyId: 'system',
                    policyName: 'Kill Switch',
                    reason: 'Payments are paused by the safety switch',
                },
            ],
        };
    }

    const userId = typeof ctx.metadata?.userId === 'string' ? String(ctx.metadata.userId) : undefined;
    const requiresApproval =
        userId && isSafeModeEnabled(userId) && !hasUserApprovedOnce(userId);
    if (requiresApproval) {
        const approved = ctx.metadata?.approved === true;
        if (!approved) {
            return {
                approved: false,
                blockedBy: 'Safe Mode',
                results: [
                    {
                        passed: false,
                        policyId: 'system',
                        policyName: 'Safe Mode',
                        reason: 'User approval required for the first spend',
                    },
                ],
            };
        }
    }

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

    if (approved && requiresApproval && userId) {
        markUserApprovedOnce(userId);
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
