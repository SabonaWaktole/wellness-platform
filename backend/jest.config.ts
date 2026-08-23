import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  // Give each Jest worker its own Postgres schema so integration suites cannot
  // clobber each other's fixtures. See tests/setup/perWorkerDb.ts.
  globalSetup: '<rootDir>/tests/setup/globalSetup.ts',
  setupFiles: ['<rootDir>/tests/setup/perWorkerDb.ts', '<rootDir>/tests/setup/testEnv.ts'],
  moduleNameMapper: {
    '^@auth/(.*)$': '<rootDir>/src/auth/$1',
    '^@tenant/(.*)$': '<rootDir>/src/tenant/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@main/(.*)$': '<rootDir>/src/main/$1',
  },
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main/server.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
};

export default config;
