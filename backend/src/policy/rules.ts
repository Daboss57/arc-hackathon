import type { Rule, PaymentContext } from './types.js';
import { getTransactionHistory } from '../treasury/wallet.service.js';

type RuleEvaluator = (params: Record<string, unknown>, ctx: PaymentContext) => Promise<{ passed: boolean; reason?: string }>;

const ruleEvaluators: Record<string, RuleEvaluator> = {
    async maxPerTransaction(params, ctx) {
        const max = params.max as number;
        const amount = parseFloat(ctx.amount);

        if (amount > max) {
            return { passed: false, reason: `Amount $${amount} exceeds max $${max} per transaction` };
        }
        return { passed: true };
    },

    async dailyLimit(params, ctx) {
        const limit = params.limit as number;
        const amount = parseFloat(ctx.amount);

        const now = new Date();
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const history = await getTransactionHistory({ status: 'confirmed' });
        const todaySpend = history
            .filter(tx => tx.createdAt >= dayStart)
            .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

        if (todaySpend + amount > limit) {
            return {
                passed: false,
                reason: `Would exceed daily limit of $${limit} (already spent $${todaySpend.toFixed(2)} today)`,
            };
        }
        return { passed: true };
    },

    async monthlyBudget(params, ctx) {
        const budget = params.budget as number;
        const amount = parseFloat(ctx.amount);

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const history = await getTransactionHistory({ status: 'confirmed' });
        const monthSpend = history
            .filter(tx => tx.createdAt >= monthStart)
            .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

        if (monthSpend + amount > budget) {
            return {
                passed: false,
                reason: `Would exceed monthly budget of $${budget} (spent $${monthSpend.toFixed(2)} this month)`,
            };
        }
        return { passed: true };
    },

    async vendorWhitelist(params, ctx) {
        const allowed = params.addresses as string[];

        if (!allowed.map(a => a.toLowerCase()).includes(ctx.recipient.toLowerCase())) {
            return { passed: false, reason: `Recipient ${ctx.recipient} not in vendor whitelist` };
        }
        return { passed: true };
    },

    async categoryLimit(params, ctx) {
        const limits = params.limits as Record<string, number>;
        const category = ctx.category || 'uncategorized';
        const limit = limits[category];

        if (limit === undefined) {
            return { passed: true };
        }

        const amount = parseFloat(ctx.amount);
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const history = await getTransactionHistory({ status: 'confirmed' });
        const categorySpend = history
            .filter(tx => tx.category === category && tx.createdAt >= monthStart)
            .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

        if (categorySpend + amount > limit) {
            return {
                passed: false,
                reason: `Would exceed ${category} limit of $${limit} (spent $${categorySpend.toFixed(2)} this month)`,
            };
        }
        return { passed: true };
    },
};

export async function evaluateRule(
    rule: Rule,
    ctx: PaymentContext
): Promise<{ passed: boolean; reason?: string }> {
    const evaluator = ruleEvaluators[rule.type];
    if (!evaluator) {
        return { passed: true };
    }
    return evaluator(rule.params, ctx);
}
