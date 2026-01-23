import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as walletService from './wallet.service.js';
import { config } from '../lib/config.js';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

// Mocks
vi.mock('../lib/config.js', () => ({
    config: {
        CIRCLE_API_KEY: 'mock-api-key',
        CIRCLE_ENTITY_SECRET: 'mock-entity-secret',
        CIRCLE_WALLET_ID: 'mock-wallet-id',
        ARC_CHAIN_ID: '1234'
    }
}));

vi.mock('../lib/logger.js', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock('@circle-fin/developer-controlled-wallets', () => ({
    initiateDeveloperControlledWalletsClient: vi.fn()
}));

vi.mock('uuid', () => ({
    v4: () => 'mock-uuid-123'
}));

describe('wallet.service', () => {
    let mockCircleClient: any;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.resetAllMocks();
        walletService.resetStoreForTesting();

        mockCircleClient = {
            getWallet: vi.fn(),
            getWalletTokenBalance: vi.fn(),
            createTransaction: vi.fn()
        };
        (initiateDeveloperControlledWalletsClient as any).mockReturnValue(mockCircleClient);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // Helper to init wallet for tests
    const initMockWallet = async () => {
        mockCircleClient.getWallet.mockResolvedValue({
            data: {
                wallet: {
                    id: 'mock-wallet-id',
                    address: '0x123',
                    blockchain: 'ARC-TESTNET',
                    state: 'LIVE',
                    createDate: new Date().toISOString()
                }
            }
        });
        mockCircleClient.getWalletTokenBalance.mockResolvedValue({
            data: { tokenBalances: [] }
        });
        await walletService.initializeWallet();
    };

    describe('initializeWallet', () => {
        it('should fetch wallet from Circle if ID is configured', async () => {
            mockCircleClient.getWallet.mockResolvedValue({
                data: {
                    wallet: {
                        id: 'mock-wallet-id',
                        address: '0x123',
                        blockchain: 'ARC-TESTNET',
                        state: 'LIVE',
                        createDate: new Date().toISOString()
                    }
                }
            });

            // Mock balance call which is part of init
            mockCircleClient.getWalletTokenBalance.mockResolvedValue({
                data: { tokenBalances: [] }
            });

            const wallet = await walletService.initializeWallet();

            expect(wallet.id).toBe('mock-wallet-id');
            expect(mockCircleClient.getWallet).toHaveBeenCalledWith({ id: 'mock-wallet-id' });
        });
    });

    describe('Balance Logic (Reserve/Release)', () => {
        it('should reserve funds if available', async () => {
            await initMockWallet();

            // Advance time to bypass cache (10s limit)
            vi.advanceTimersByTime(11000);

            // Mock balance response for refresh
            mockCircleClient.getWalletTokenBalance.mockResolvedValue({
                data: {
                    tokenBalances: [
                        { token: { symbol: 'USDC' }, amount: '100.00' }
                    ]
                }
            });
            await walletService.getBalance(); // Triggers refresh

            const success = await walletService.reserveFunds('10.00');
            expect(success).toBe(true);

            const balance = await walletService.getBalance();
            expect(balance.reserved).toBe('10.00');
            expect(balance.available).toBe('90.00');
        });

        it('should fail reservation if insufficient funds', async () => {
            await initMockWallet();
            const success = await walletService.reserveFunds('999999.00');
            expect(success).toBe(false);
        });

        it('should release funds correctly', async () => {
            await initMockWallet();
            vi.advanceTimersByTime(11000);

            // Mock balance to 100
            mockCircleClient.getWalletTokenBalance.mockResolvedValue({
                data: {
                    tokenBalances: [
                        { token: { symbol: 'USDC' }, amount: '100.00' }
                    ]
                }
            });
            await walletService.getBalance();

            // Reserve 10.00
            await walletService.reserveFunds('10.00');

            const initialBalance = await walletService.getBalance();
            const initialReserved = parseFloat(initialBalance.reserved); // 10.00

            await walletService.releaseFunds('5.00');

            const newBalance = await walletService.getBalance();
            expect(parseFloat(newBalance.reserved)).toBeCloseTo(initialReserved - 5);
        });
    });

    describe('transferUsdc', () => {
        it('should successfully initiate a transfer', async () => {
            // Mock getUsdcTokenId flow
            mockCircleClient.getWalletTokenBalance.mockResolvedValue({
                data: {
                    tokenBalances: [
                        { token: { symbol: 'USDC', id: 'token-id-1' }, amount: '100.00' }
                    ]
                }
            });

            // Mock createTransaction flow
            mockCircleClient.createTransaction.mockResolvedValue({
                data: {
                    id: 'tx-id-123',
                    state: 'PENDING',
                    txHash: '0xhash'
                }
            });

            const result = await walletService.transferUsdc('0xDest', '5.00');

            expect(result.success).toBe(true);
            expect(result.transactionId).toBe('tx-id-123');
            expect(mockCircleClient.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
                destinationAddress: '0xDest',
                amount: ['5.00'],
                tokenId: 'token-id-1'
            }));
        });

        it('should fail if Token ID not found', async () => {
            mockCircleClient.getWalletTokenBalance.mockResolvedValue({
                data: { tokenBalances: [] } // No USDC
            });

            const result = await walletService.transferUsdc('0xDest', '5.00');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Could not find USDC');
        });
    });

    describe('Spending Analytics', () => {
        it('should calculate daily spend correctly', async () => {
            await initMockWallet();

            await walletService.recordTransaction({
                amount: '25.00',
                category: 'FOOD',
                status: 'confirmed',
                to: '0x123',
                from: '0xabc',
                txHash: '',
                currency: 'USDC',
            });

            const analytics = await walletService.getSpendingAnalytics();

            expect(analytics.daily.spent).toBeGreaterThanOrEqual(25.00);
            expect(analytics.byCategory['FOOD']).toBeDefined();
        });

        it('should warn if budget exceeded', async () => {
            await initMockWallet();

            // Daily limit is 50. We spend 45 (90% usage)
            await walletService.recordTransaction({
                amount: '45.00',
                category: 'Tech',
                status: 'confirmed',
                to: '0x123',
                from: '0xabc',
                txHash: '',
                currency: 'USDC',
            });

            const analytics = await walletService.getSpendingAnalytics();
            expect(analytics.warning).toBeDefined();
            expect(analytics.warning).toContain('daily limit used');
        });
    });
});
