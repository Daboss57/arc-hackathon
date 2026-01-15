import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { config } from 'dotenv';
import path from 'path';

// Load env from backend/.env
config({ path: path.join(process.cwd(), '.env') });

const circleClient = initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

async function testSigning() {
    const walletId = process.env.CIRCLE_WALLET_ID;
    if (!walletId) {
        console.error('No CIRCLE_WALLET_ID in env');
        return;
    }

    console.log('Testing signing with wallet:', walletId);

    // Fetch wallet details first
    const wallet = await circleClient.getWallet({ id: walletId });
    console.log('Wallet Blockchain:', wallet.data?.wallet?.blockchain);
    console.log('Wallet Address:', wallet.data?.wallet?.address);
    console.log('Wallet Config:', JSON.stringify(wallet.data?.wallet));

    // Test cases for Chain ID
    const chainIdsToTest = [
        1620,               // Number
        "1620",             // String
        "0x654",            // Hex string
        "0x0654"            // Padded hex
    ];

    const paymentPayload = {
        from: "0x73b28badd68212ce5e26e6d87c21113501775a65", // Use specific address from logs
        to: "0x03972eb60d23a16edf247a521b83153ceb70f9e9",
        value: "10000",
        validAfter: "0",
        validBefore: Math.floor(Date.now() / 1000 + 3600).toString(),
        nonce: '0x' + Date.now().toString(16).padStart(64, '0'),
    };

    for (const chainId of chainIdsToTest) {
        console.log(`\n--- Testing with Chain ID: ${JSON.stringify(chainId)} (${typeof chainId}) ---`);

        const typedData = JSON.stringify({
            types: {
                EIP712Domain: [
                    { name: 'name', type: 'string' },
                    { name: 'version', type: 'string' },
                    { name: 'chainId', type: 'uint256' },
                ],
                ReceiveWithAuthorization: [
                    { name: 'from', type: 'address' },
                    { name: 'to', type: 'address' },
                    { name: 'value', type: 'uint256' },
                    { name: 'validAfter', type: 'uint256' },
                    { name: 'validBefore', type: 'uint256' },
                    { name: 'nonce', type: 'bytes32' },
                ],
            },
            domain: {
                name: 'USD Coin',
                version: '2',
                chainId: chainId,
            },
            primaryType: 'ReceiveWithAuthorization',
            message: paymentPayload,
        });

        try {
            console.log('Sending request...');
            const response = await circleClient.signTypedData({
                walletId,
                data: typedData,
            });
            console.log('SUCCESS! Signature:', response.data?.signature?.substring(0, 20) + '...');
            return; // Exit on first success
        } catch (err: any) {
            console.error('FAILED:', err.response?.data ? JSON.stringify(err.response.data) : err.message);
        }
    }
}

testSigning().catch(console.error);
