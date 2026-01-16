import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recordTransaction, getTransactionHistory, getSpendingAnalytics, resetStoreForTesting } from './wallet.service';
import type { Transaction } from './types';

describe('x-user-id Header System', () => {
    beforeEach(() => {
        resetStoreForTesting();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('recordTransaction with userId', () => {
        it('should store userId on transaction', async () => {
            const tx = await recordTransaction({
                txHash: '0xabc123',
                from: '0xfrom',
                to: '0xto',
                amount: '10.00',
                currency: 'USDC',
                status: 'confirmed',
                category: 'test',
                userId: 'user_alice',
            });

            expect(tx.userId).toBe('user_alice');
            expect(tx.id).toBeDefined();
            expect(tx.createdAt).toBeInstanceOf(Date);
        });

        it('should allow undefined userId (system transactions)', async () => {
            const tx = await recordTransaction({
                txHash: '0xabc123',
                from: '0xfrom',
                to: '0xto',
                amount: '5.00',
                currency: 'USDC',
                status: 'confirmed',
            });

            expect(tx.userId).toBeUndefined();
        });
    });

    describe('getTransactionHistory with userId filter', () => {
        beforeEach(async () => {
            // Seed transactions for different users
            await recordTransaction({
                txHash: '0x1',
                from: '0xfrom',
                to: '0xto',
                amount: '10.00',
                currency: 'USDC',
                status: 'confirmed',
                userId: 'user_alice',
            });
            await recordTransaction({
                txHash: '0x2',
                from: '0xfrom',
                to: '0xto',
                amount: '20.00',
                currency: 'USDC',
                status: 'confirmed',
                userId: 'user_bob',
            });
            await recordTransaction({
                txHash: '0x3',
                from: '0xfrom',
                to: '0xto',
                amount: '30.00',
                currency: 'USDC',
                status: 'confirmed',
                userId: 'user_alice',
            });
            await recordTransaction({
                txHash: '0x4',
                from: '0xfrom',
                to: '0xto',
                amount: '40.00',
                currency: 'USDC',
                status: 'pending',
                // No userId - system transaction
            });
        });

        it('should return only transactions for specified userId', async () => {
            const aliceHistory = await getTransactionHistory({}, 'user_alice');

            expect(aliceHistory).toHaveLength(2);
            expect(aliceHistory.every(tx => tx.userId === 'user_alice')).toBe(true);
        });

        it('should return different transactions for different users', async () => {
            const aliceHistory = await getTransactionHistory({}, 'user_alice');
            const bobHistory = await getTransactionHistory({}, 'user_bob');

            expect(aliceHistory).toHaveLength(2);
            expect(bobHistory).toHaveLength(1);
            expect(bobHistory[0].amount).toBe('20.00');
        });

        it('should return all transactions when no userId specified', async () => {
            const allHistory = await getTransactionHistory({});

            expect(allHistory).toHaveLength(4);
        });

        it('should respect limit and offset with userId filter', async () => {
            const aliceHistory = await getTransactionHistory({ limit: 1, offset: 0 }, 'user_alice');

            expect(aliceHistory).toHaveLength(1);
        });

        it('should return empty array for user with no transactions', async () => {
            const charlieHistory = await getTransactionHistory({}, 'user_charlie');

            expect(charlieHistory).toHaveLength(0);
        });
    });

    describe('getSpendingAnalytics with userId filter', () => {
        beforeEach(async () => {
            // Seed confirmed transactions for different users
            await recordTransaction({
                txHash: '0x1',
                from: '0xfrom',
                to: '0xto',
                amount: '10.00',
                currency: 'USDC',
                status: 'confirmed',
                category: 'shopping',
                userId: 'user_alice',
            });
            await recordTransaction({
                txHash: '0x2',
                from: '0xfrom',
                to: '0xto',
                amount: '5.00',
                currency: 'USDC',
                status: 'confirmed',
                category: 'api',
                userId: 'user_alice',
            });
            await recordTransaction({
                txHash: '0x3',
                from: '0xfrom',
                to: '0xto',
                amount: '25.00',
                currency: 'USDC',
                status: 'confirmed',
                category: 'shopping',
                userId: 'user_bob',
            });
        });

        it('should calculate analytics only for specified user', async () => {
            const aliceAnalytics = await getSpendingAnalytics('user_alice');

            expect(aliceAnalytics.daily.spent).toBe(15); // 10 + 5
            expect(aliceAnalytics.monthly.spent).toBe(15);
            expect(aliceAnalytics.recentTransactions).toBe(2);
        });

        it('should show category breakdown per user', async () => {
            const aliceAnalytics = await getSpendingAnalytics('user_alice');

            expect(aliceAnalytics.byCategory['shopping']).toBe(10);
            expect(aliceAnalytics.byCategory['api']).toBe(5);
        });

        it('should return different analytics for different users', async () => {
            const aliceAnalytics = await getSpendingAnalytics('user_alice');
            const bobAnalytics = await getSpendingAnalytics('user_bob');

            expect(aliceAnalytics.daily.spent).toBe(15);
            expect(bobAnalytics.daily.spent).toBe(25);
        });

        it('should return global analytics when no userId specified', async () => {
            const globalAnalytics = await getSpendingAnalytics();

            expect(globalAnalytics.daily.spent).toBe(40); // 10 + 5 + 25
            expect(globalAnalytics.recentTransactions).toBe(3);
        });

        it('should return zero spending for user with no transactions', async () => {
            const charlieAnalytics = await getSpendingAnalytics('user_charlie');

            expect(charlieAnalytics.daily.spent).toBe(0);
            expect(charlieAnalytics.monthly.spent).toBe(0);
            expect(charlieAnalytics.recentTransactions).toBe(0);
        });

        it('should not include pending transactions in analytics', async () => {
            await recordTransaction({
                txHash: '0x999',
                from: '0xfrom',
                to: '0xto',
                amount: '100.00',
                currency: 'USDC',
                status: 'pending',
                userId: 'user_alice',
            });

            const aliceAnalytics = await getSpendingAnalytics('user_alice');

            // Should still be 15, not 115
            expect(aliceAnalytics.daily.spent).toBe(15);
        });
    });

    describe('userId isolation guarantees', () => {
        it('should never leak data between users', async () => {
            // User A records a transaction
            await recordTransaction({
                txHash: '0xsecret',
                from: '0xfrom',
                to: '0xto',
                amount: '999.00',
                currency: 'USDC',
                status: 'confirmed',
                description: 'Secret purchase',
                userId: 'user_secret',
            });

            // User B should not see it
            const publicHistory = await getTransactionHistory({}, 'user_public');
            const publicAnalytics = await getSpendingAnalytics('user_public');

            expect(publicHistory).toHaveLength(0);
            expect(publicHistory.some(tx => tx.description === 'Secret purchase')).toBe(false);
            expect(publicAnalytics.daily.spent).toBe(0);
        });
    });
});
