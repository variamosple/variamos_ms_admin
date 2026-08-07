import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import nodePlugin from 'eslint-plugin-n';
import prettierPlugin from 'eslint-plugin-prettier';
import jestPlugin from 'eslint-plugin-jest';
import globals from 'globals';

export default [
  // Global ignores (replaces .eslintignore)
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.stryker-tmp/**'],
  },
  // Base configuration
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'n': nodePlugin,
      'node': nodePlugin,
      'prettier': prettierPlugin,
    },
    settings: {
      node: {
        tryExtensions: ['.js', '.json', '.node', '.ts'],
      },
    },
    rules: {
      // Base ESLint recommended rules
      ...eslint.configs.recommended.rules,

      // TypeScript eslint recommended overrides
      ...tsPlugin.configs.recommended.rules,
      ...tsPlugin.configs['recommended-requiring-type-checking']?.rules,
      
      // Node plugin recommended overrides
      ...nodePlugin.configs.recommended.rules,

      // Custom Rules
      '@typescript-eslint/explicit-member-accessibility': 'warn',
      '@typescript-eslint/no-misused-promises': 0,
      '@typescript-eslint/no-floating-promises': 0,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' }
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSAsExpression[expression.type='TSAsExpression']",
          message: "Double assertions (e.g., 'as unknown as T') are forbidden. Cast directly or use explicit mapping functions."
        },
        {
          selector: "TSUnknownKeyword",
          message: "The 'unknown' type is forbidden. Use concrete types, generics (T), or 'void' for empty values. If you really think you need 'unknown' for a specific exception, disable the linter on that line using '// eslint-disable-next-line no-restricted-syntax'."
        }
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/../../*'],
              message: 'Please use the @src alias instead of deep relative imports (../../).'
            }
          ]
        }
      ],
      'no-console': [
        'error',
        { allow: ['warn', 'error'] }
      ],
      'no-extra-boolean-cast': 0,
      'node/no-process-env': 1,
      'node/no-unsupported-features/es-syntax': [
        'error',
        { ignores: ['modules'] }
      ],
      'node/no-missing-import': 0,
      'node/no-unpublished-import': 0,
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto'
        }
      ]
    }
  },
  // Domain layer specific rules
  {
    files: ['src/Domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@src/DataProviders/**', '@src/EntryPoints/**', '@src/Infrastructure/**'],
              message: 'The Domain layer must be pure. Do not import from DataProviders, EntryPoints, or Infrastructure. Use Dependency Injection.'
            },
            {
              group: ['**/../../*'],
              message: 'Please use the @src alias instead of deep relative imports (../../).'
            }
          ]
        }
      ]
    }
  },
  // Test files specific configuration
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    plugins: {
      jest: jestPlugin,
    },
    languageOptions: {
      globals: {
        ...jestPlugin.environments.globals.globals,
      },
    },
    rules: {
      ...jestPlugin.configs.recommended.rules,
      'jest/no-disabled-tests': 'warn',
      'jest/no-focused-tests': 'error',
      'jest/no-identical-title': 'error',
      'jest/expect-expect': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'no-restricted-syntax': 'off'
    }
  }
];
