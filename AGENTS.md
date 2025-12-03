# Agent Guidelines

Welcome to the Monarch Money MCP repository. Follow these best practices when making changes:

- Prefer TypeScript and align with existing patterns in `src/`. Keep modules small and focused on a single responsibility.
- Validate inputs with existing schemas (e.g., `zod`) and avoid adding new external dependencies without approval.
- Use existing scripts for quality checks:
  - `npm run lint` for linting
  - `npm run type-check` for TypeScript types
  - `npm test` for unit tests (use `npm test -- --watch` only during local development)
- Run the relevant checks above whenever you change code. For documentation-only updates, a test run is optional.
- Keep environment secrets and tokens out of the repo. Favor configuration via `.env` and avoid committing generated artifacts under `.smithery/`.
- Follow Prettier/ESLint defaults; do not wrap imports in `try/catch` blocks.
- When adding new commands or server handlers, include brief JSDoc/TS doc comments explaining the behavior and inputs.
