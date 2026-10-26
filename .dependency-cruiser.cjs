// Test files may reach any layer to build their doubles.
const TESTS = '\\.(test|spec)\\.ts$';

module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'The Domain folder must not depend on any external layers (Infrastructure, DataProviders, EntryPoints, or common).',
      severity: 'error',
      from: { path: '^src/Domain' },
      to: { path: '^src/Infrastructure|^src/DataProviders|^src/EntryPoints|^src/common' }
    },
    {
      name: 'domain-uses-no-package',
      comment: 'The Domain depends on no npm package: a library goes behind a port implemented in Infrastructure. Node built-ins stay allowed.',
      severity: 'error',
      from: { path: '^src/Domain', pathNot: TESTS },
      to: { dependencyTypesNot: ['local', 'core'] }
    },
    {
      name: 'entrypoints-go-through-the-domain',
      comment: 'Routers call use cases; they do not reach the ORM models, repositories or infrastructure clients.',
      severity: 'error',
      from: { path: '^src/EntryPoints', pathNot: TESTS },
      to: { path: '^src/Infrastructure|^src/DataProviders' }
    },
    {
      name: 'infrastructure-does-not-use-dataproviders',
      comment: 'Infrastructure adapters reach the data through domain ports.',
      severity: 'error',
      from: { path: '^src/Infrastructure', pathNot: TESTS },
      to: { path: '^src/DataProviders' }
    },
    {
      name: 'dataproviders-do-not-import-common',
      comment: 'Data Providers must not import infrastructure utilities from common.',
      severity: 'error',
      from: { path: '^src/DataProviders' },
      to: { path: '^src/common' }
    },
    {
      name: 'no-circular-dependencies',
      comment: 'Forbidden circular dependencies that can corrupt execution.',
      severity: 'error',
      from: {},
      to: {
        circular: true
      }
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules'
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json'
    },
    // "#src/*" (package.json "imports") must resolve to src/ for the rules above to apply;
    // without this condition it resolves to dist/, which no rule matches.
    enhancedResolveOptions: {
      conditionNames: ['variamos-dev', 'import', 'node', 'default']
    }
  }
};
