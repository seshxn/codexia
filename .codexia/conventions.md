# Conventions

## Naming

- Classes: `PascalCase`
- Interfaces: `PascalCase` (no I prefix)
- Functions: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Files: `kebab-case.ts`

## Structure

- One class per file for major components
- Group related types in a single `types.ts`
- Use barrel exports (`index.ts`) for modules

## Imports

- Use `.js` extension for local imports (ESM compatibility)
- Group imports: external, internal, types
- Prefer named exports over default exports

## Documentation

- JSDoc for public APIs
- Inline comments for complex logic
- README for each major module

## Error Handling

- Use typed errors where possible
- Always catch and handle errors in CLI commands
- Provide helpful error messages
