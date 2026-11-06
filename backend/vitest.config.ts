import { defineConfig } from 'vitest/config';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:devpass@localhost:5433/pmo_test';
export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 180000,
    env: {
      NODE_ENV: 'test', DATABASE_URL: url, JWT_SECRET: 'test-secret-test-secret-test-secret-42',
      SEED_DEMO: 'true', DEMO_PASSWORD: 'TestPass-2026x', JOBS_ENABLED: 'false', AI_PROVIDER: 'local', LOGIN_RATE_LIMIT: '1000',
    },
  },
});
