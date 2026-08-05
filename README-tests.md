# Backend Testing & Mutation Guide (variamos_ms_admin)

This guide provides developers with the essential principles, standards, and commands to maintain the quality and robustness of the backend test suite, including our mutation testing framework (Stryker).

---

## Testing Architecture

The backend test suite is split into two main layers following Clean Architecture guidelines:

1. **Unit Tests (Domain Layer)**:
   - Focus on business rules and core entities (`src/Domain`).
   - Mock all database and network interactions.
   - Tests must run fast and have high assertions accuracy.
   - *Command*: `npm run test:unit`

2. **Integration Tests (EntryPoints/Infrastructure)**:
   - Validate HTTP API endpoints and controllers (`src/EntryPoints`) and database persistence.
   - Use `supertest` to trigger actual HTTP requests.
   - *Command*: `npm run test:integration`

---

## Mutation Testing with Stryker

Unlike traditional code coverage (which only measures if a line of code is *executed*), **Mutation Testing** evaluates if your test assertions are actually *effective*.

### How it works:
Stryker injects small modifications ("mutants") into your source code (e.g., changing `>` to `>=`, `&&` to `||`, or deleting function calls). It then runs your tests.
- **Killed mutant**: A test failed because of the modification. This is the **desired result** (your tests are validating the behavior).
- **Survived mutant**: All tests passed despite the code modification. This indicates a **testing gap** (missing assertions or untested logic).

### Stryker Configuration & Critical Mutants:
- **Domain Logic (`npm run stryker:domain`)**: We require near-zero surviving mutants in the core `Domain` layer.
- **Critical Mutants** to watch out for:
  - **Logical boundaries**: Mutants changing access control checks (e.g., bypassing `isAdmin` status) or validation logic.
  - **Data mutation omissions**: Mutants where an update state line is deleted or bypassed, but the test still passes because it only asserts the HTTP status code rather than the database state.
  - **Math operations**: Mutants altering calculation logic.

---

## Helpful Commands

- **Run all unit & integration tests**:
  ```bash
  npm run test
  ```
- **Run tests with coverage**:
  ```bash
  npm run test:coverage
  ```
- **Run Stryker mutation tests on Domain**:
  ```bash
  npm run stryker:domain
  ```
- **Run Stryker mutation tests on EntryPoints**:
  ```bash
  npm run stryker:entrypoints
  ```
