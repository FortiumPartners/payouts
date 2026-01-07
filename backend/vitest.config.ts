import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';

// Load env from parent directory
dotenvConfig({ path: resolve(__dirname, '../.env') });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
