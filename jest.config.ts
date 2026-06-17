import type { Config } from 'jest';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load the test environment variables before anything else
dotenv.config({ path: path.join(__dirname, 'env/test.env') });

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/src/**/*.spec.ts', '**/src/**/*.test.ts'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};

export default config;
