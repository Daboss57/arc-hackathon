import { ethers } from 'ethers';
import { config } from './config.js';

let provider: ethers.JsonRpcProvider | null = null;

export function getProvider(): ethers.JsonRpcProvider {
    if (!provider) {
        provider = new ethers.JsonRpcProvider(config.ARC_RPC_URL, {
            chainId: config.ARC_CHAIN_ID,
            name: 'arc',
        });
    }
    return provider;
}

// USDC on Arc uses 18 decimals for native, 6 decimals for ERC20 interface
export const USDC_DECIMALS = {
    native: 18,
    erc20: 6,
};

// ERC20 USDC interface address on Arc
export const USDC_ERC20_ADDRESS = '0x3600000000000000000000000000000000000000';

export function parseUsdcAmount(amount: string, decimals: number = USDC_DECIMALS.erc20): bigint {
    return ethers.parseUnits(amount, decimals);
}

export function formatUsdcAmount(amount: bigint, decimals: number = USDC_DECIMALS.erc20): string {
    return ethers.formatUnits(amount, decimals);
}

export async function getBlockNumber(): Promise<number> {
    const p = getProvider();
    return p.getBlockNumber();
}
