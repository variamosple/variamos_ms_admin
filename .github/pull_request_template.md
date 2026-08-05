## Description
Provide a brief summary of the changes introduced by this Pull Request, including the motivation or context.

### Key Changes
- [First major change / feature added]
- [Second major change / bug fixed]

## Related Issue / Ticket
If applicable, link the related issue or ticket here (e.g., Closes #123).

## How to Test
Describe the steps required to verify and test the changes.
1. Run `npm install` to ensure all packages are up to date.
2. Start the service or run database migration/seed scripts if applicable.
3. [Insert specific testing steps, API endpoints, or payloads here]

## Checklist
Before submitting this Pull Request, please ensure you have completed the following checks:
- [ ] My code compiles and builds successfully without errors (`npm run build`).
- [ ] I have verified TypeScript types (`npm run typecheck`).
- [ ] I have run the linter and formatted my code (`npm run lint`).
- [ ] All unit and integration tests pass successfully (`npm run test`).
- [ ] I have added or updated unit/integration tests to cover the new logic.
- [ ] I have run Stryker mutation tests if domain logic was modified, ensuring critical mutants are handled.
- [ ] I have verified that Clean Architecture boundaries are respected (`npm run check-arch`).
