// jest.config.js
const { defaults: tsjPreset } = require("ts-jest/presets");
const { transform } = require("typescript");

module.exports = {
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    '^.+\\.(ts)$': ['ts-jest', { useESM: true }],
  },
  moduleFileExtensions: ["ts", "js", "json"],
  testMatch: ["**/__tests__/*.ts", "**/?(*.)+(spec|test).ts"],
  collectCoverageFrom: [
    "src/*.ts",
    "!src/*.d.ts",
    "!src/index.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  moduleNameMapper: {
    "^@schorts/browser-cache/(.*)$": "<rootDir>/src/$1",
  },
};
