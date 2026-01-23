import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
    CIRCLE_API_KEY: z.string().min(1),
    CIRCLE_ENTITY_SECRET: z.string().optional(),
    CIRCLE_WALLET_SET_ID: z.string().optional(),
    CIRCLE_WALLET_ID: z.string().optional(),
    ARC_RPC_URL: z.string().url().default('https://testnet.arc.network'),
    ARC_CHAIN_ID: z.coerce.number().default(1620),
    X402_FACILITATOR_URL: z.string().url().optional(),
    PORT: z.coerce.number().default(3001),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    API_SECRET: z.string().optional(),
    DATA_STORE_PATH: z.string().optional(),
});

function loadConfig() {
    const parsed = envSchema.safeParse(process.env);

    if (!parsed.success) {
        console.error('Invalid environment configuration:');
        console.error(parsed.error.format());
        process.exit(1);
    }

    return parsed.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof envSchema>;
