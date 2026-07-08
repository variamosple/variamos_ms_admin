module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'The Domain folder must not depend on any external layers (Infrastructure, DataProviders, EntryPoints, or common/EnvVars).',
      severity: 'error',
      from: { path: '^src/Domain' },
      to: { path: '^src/Infrastructure|^src/DataProviders|^src/EntryPoints|^src/common/EnvVars\\.ts$' }
    },
    {
      name: 'usecases-do-not-import-http-directly',
      comment: 'Use Cases must not import infrastructure HTTP codes.',
      severity: 'error',
      from: { path: '^src/Domain/.*UseCases\\.ts$' },
      to: { path: '^src/common/HttpStatusCodes\\.ts$' }
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
