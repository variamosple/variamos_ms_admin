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
      name: 'dataproviders-do-not-import-common',
      comment: 'Data Providers must not import infrastructure utilities from common.',
      severity: 'error',
      from: { path: '^src/DataProviders' },
      to: { path: '^src/common' }
    },
    {
      name: 'no-circular-dependencies',
      comment: 'Forbidden circular dependencies that can corrupt execution.',
      severity: 'warn',
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
    }
  }
};
