import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// The client's `lint` script used to be `vite build`, which is a build and not a
// lint: it type-checks nothing and reports no unused or undefined identifiers.
// DEF-038 and DEF-043 were both undefined-at-runtime bugs that the build waved
// through, so linting that can see them is worth having.
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Kept visible but not blocking. These two flag a pattern used throughout
      // this codebase — load data in an effect, then set state — which works and
      // is not what DEF-038 or DEF-043 were. Refactoring twenty-one call sites
      // days before submission would risk regressions in working screens for no
      // correctness gain, so they are recorded as warnings and left as work for
      // after marking rather than silenced outright.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      // JSX consumes the identifier in a way core ESLint does not see, so the
      // component import must not be reported as unused.
      // A catch binding that is not read is normal here: the handler reports the
      // failure to the user rather than echoing the exception, which is the
      // behaviour this project wants.
      'no-unused-vars': [
        'warn',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      'no-undef': 'error'
    }
  },
  {
    files: ['src/__tests__/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.vitest }
    }
  }
];
