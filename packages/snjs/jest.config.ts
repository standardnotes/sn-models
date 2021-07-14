const { pathsToModuleNameMapper } = require('ts-jest/utils');
const { compilerOptions } = require('./lib/tsconfig');

/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */
export default {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: [
    'lib/**/{!(index),}.ts'
  ],

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
    '/node_modules/'
  ],

  // Indicates which provider should be used to instrument code for coverage
  // coverageProvider: 'babel',

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: [
    'json',
    'text',
    'html'
  ],

  // A path to a module which exports an async function that is triggered once before all test suites
  // globalSetup: undefined,

  // A path to a module which exports an async function that is triggered once after all test suites
  // globalTeardown: undefined,

  // A set of global variables that need to be available in all test environments
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/lib/tsconfig.json',
      isolatedModules: true
    }
  },

  /**
   * A map from regular expressions to module names or to arrays of module names that allow to stub out resources with a single module.
   * Paths obtained from lib/tsconfig.json
   */
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/lib'
  }),

  // A preset that is used as a base for Jest's configuration
  preset: 'ts-jest',

  resetMocks: true,

  resetModules: true,

  // A list of paths to directories that Jest should use to search for files in
  roots: [
    '<rootDir>/lib',
    '<rootDir>/test'
  ],

  // The paths to modules that run some code to configure or set up the testing environment before each test
  setupFiles: [
    '<rootDir>/test/setup/global.ts',
    '<rootDir>/test/setup/jsdom.ts',
    '<rootDir>/test/setup/mock.ts'
  ],

  // The test environment that will be used for testing
  testEnvironment: 'jsdom',

  // The glob patterns Jest uses to detect test files
  testMatch: [
    '<rootDir>/test/**/?(*.)+(test).(ts|js)'
  ],

  // A map from regular expressions to paths to transformers
  transform: {
    '^.+\\.(ts|js)?$': 'ts-jest'
  },

  verbose: true
};
