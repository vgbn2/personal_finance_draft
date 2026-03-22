/**
 * Exercise 8: Environment Safety
 * 
 * Objective: Validate .env using Zod.
 * 
 * Instructions:
 * 1. Define a schema for PORT and TERMINUS_API_KEY.
 * 2. Use schema.parse(process.env).
 * 3. Wrap in a try/catch to log friendly errors.
 */

import { z } from 'zod';

const envSchema = z.object({
    PORT: z.string().transform(Number).default('3001'),
    TERMINUS_API_KEY: z.string().min(10),
});

export function validateEnv() {
    // TODO: Implement validation
}
