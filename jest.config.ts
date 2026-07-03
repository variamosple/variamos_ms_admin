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
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.stryker-tmp/'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/EntryPoints/**/*.ts': {
      branches: 50,
      functions: 70,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
