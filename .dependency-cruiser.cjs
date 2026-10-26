// Test files may reach any layer to build their doubles.
const TESTS = '\\.(test|spec)\\.ts$';

// Packages the domain still imports, removed by lot 3 of EV-98 (ports for the logger and the
// GitHub client, session type moved out of the domain). Listed here so that no other domain
// file starts importing them, and so that a new package is refused outright.
const DOMAIN_PACKAGES_BASELINE = '^node_modules/(jet-logger|axios|@variamosple/variamos-security)/';
const DOMAIN_PACKAGES_BASELINE_FILES = [
  '^src/Domain/Bug/Service/GitHubTokenResolver\\.ts$',
  '^src/Domain/Bug/UseCase/Bug(Attachment|Query|Lifecycle|Sync|Assignment)UseCase\\.ts$',
  '^src/Domain/MicroService/UseCase/MicroServiceManagementUseCase\\.ts$',
  '^src/Domain/User/Entity/SessionInfoResponse\\.ts$',
  '^src/Domain/User/Service/(PasswordResetToken|AccountLockout|PasswordPolicy)Service\\.ts$',
  '^src/Domain/User/UseCase/UserPasswordUseCase\\.ts$',
  '^src/Domain/Mfa/UseCase/(TrustedDevice|UserMfa|MfaReset|MfaSignIn)UseCase\\.ts$',
];

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
      to: { dependencyTypesNot: ['local', 'core'], pathNot: DOMAIN_PACKAGES_BASELINE }
    },
    {
      name: 'domain-packages-baseline',
      comment: 'Only the files listed in DOMAIN_PACKAGES_BASELINE_FILES may still import the baseline packages.',
      severity: 'error',
      from: { path: '^src/Domain', pathNot: [TESTS, ...DOMAIN_PACKAGES_BASELINE_FILES] },
      to: { path: DOMAIN_PACKAGES_BASELINE }
    },
    {
      name: 'entrypoints-go-through-the-domain',
      comment: 'Routers call use cases; they do not reach the ORM models, repositories or infrastructure clients. The two routers listed are moved behind use cases by lot 3 of EV-98.',
      severity: 'error',
      from: {
        path: '^src/EntryPoints',
        pathNot: [TESTS, '^src/EntryPoints/(HealthRouter|AdminNotificationsRouter)\\.ts$']
      },
      to: { path: '^src/Infrastructure|^src/DataProviders' }
    },
    {
      name: 'infrastructure-does-not-use-dataproviders',
      comment: 'Infrastructure adapters reach the data through domain ports. HealthCheckCollector is moved behind a port by lot 3 of EV-98.',
      severity: 'error',
      from: {
        path: '^src/Infrastructure',
        pathNot: [TESTS, '^src/Infrastructure/Health/HealthCheckCollector\\.ts$']
      },
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
