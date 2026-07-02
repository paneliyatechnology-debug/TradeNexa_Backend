/**
 * ESLint configuration for TradeNexa Backend.
 * Enforces recommended rules, Prettier formatting, and unused-var checks.
 */
module.exports = {
  env: { node: true, es2022: true },
  extends: ['eslint:recommended', 'prettier'],
  plugins: ['prettier'],
  ignorePatterns: ['node_modules/', 'database/migrations/'],
  rules: {
    'prettier/prettier': 'error',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
