// Using ESLint Flat Config format for v9.0.0
import eslint from '@eslint/js';
import * as tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Global ignores
  {
    ignores: [
      "src/context/ResumeContext.jsx", // From legacy .eslintignore
      // Add other global ignores here if needed, e.g., build output directories
      "dist/",
      "node_modules/", // Though ESLint usually ignores this by default
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      import: importPlugin
    },
    // Removed the phantom file reference
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      }
    },
    settings: {
      // Configure import resolver to understand TypeScript importss
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx']
        },
        typescript: true
      },
      // Add React version detection
      react: {
        version: 'detect'
      }
    },
    rules: {
      // React rules
      'react/prop-types': 0,
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Import rules
      'import/no-unresolved': 'off',
      'import/named': 'error',
      'import/default': 'error',
      'import/namespace': 'error',
      'import/export': 'error',

      // TypeScript specific rules
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_'
      }],

      // Additional rules from airbnb config
      'consistent-return': 'error'
    }
  },
  // Add Prettier as the last configuration to override other formatting rules
  {
    files: ['create-checkout-session.js', 'create-customer-portal-session.js', 'create-portal-session.js', 'supabase/functions/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.deno,
        Deno: 'readonly',
      }
    }
  },
  {
    files: ['supabase/functions/stripe-webhook/index.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  {
    files: ['supabase/functions/verify-checkout-session/index.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
  prettierConfig // Ensure Prettier is last
];
