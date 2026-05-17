<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

---

# Universal Development Rules

## TypeScript

- Never use `any`. Use `unknown` and narrow with type guards, or define a proper type.
- Prefer `interface` for object shapes, `type` for unions/intersections/utility types.
- Enable and respect strict mode. Do not suppress TS errors with `@ts-ignore` or `@ts-expect-error` without a comment explaining why.
- Export types and interfaces from the file where they are defined, not from a central barrel unless the project already uses one.

## Naming

- Files and folders: `kebab-case` (e.g. `user-profile.tsx`, `auth-utils.ts`).
- React components: `PascalCase` named exports. No default export for components.
- Variables and functions: `camelCase`.
- Constants (module-level, never reassigned): `SCREAMING_SNAKE_CASE`.
- Boolean variables: prefix with `is`, `has`, `can`, `should` (e.g. `isLoading`, `hasError`).

## Imports

- Order: built-ins → third-party → internal (`@/…`) → relative. One blank line between groups.
- Use path aliases (`@/`) for all non-relative imports. Never use `../../../`.
- No unused imports. Remove them immediately — do not comment them out.

## Functions and Components

- One exported item per file. Keep files focused.
- Functions must do one thing. If a function needs a comment to explain what it does, split it.
- Prefer `async/await` over raw `.then()` chains.
- Handle errors explicitly at the call site or propagate them intentionally — never silently swallow.
- Default function parameters over `|| fallback` expressions inside the body.

## React / Next.js

- Server Components by default. Only add `"use client"` when you need browser APIs, event handlers, or hooks.
- Keep Server Components free of client-only imports (`useState`, `useEffect`, browser globals).
- Data fetching lives in Server Components or Route Handlers, not in `useEffect`.
- Never fetch data inside a `useEffect` unless it is truly client-side-only (e.g. geolocation). Use RSC or React Query instead.
- Client-side data fetching must use **React Query** (`@tanstack/react-query`). Do not hand-roll fetch + useState + useEffect for server data.
  - `useQuery` for reads, `useMutation` for writes.
  - Define query keys as constants or factory functions — never inline strings.
  - Set `staleTime` explicitly per query; do not rely on the default 0.
  - Invalidate related queries inside `onSuccess` of a mutation instead of manually syncing state.
- Colocate a component's styles, hooks, and helpers in the same folder if they are only used by that component.

## State Management (Zustand)

- One store slice per domain. Do not put unrelated state in the same slice.
- Derive computed values inside selectors, not stored as redundant state.
- Never mutate state directly — always use the setter or `immer` patch pattern.

## API Routes / Backend

- Validate all incoming request data at the boundary (body, params, query). Reject with 400 before touching the database.
- Return consistent shapes: `{ data, error }` or use a standard `ApiResponse<T>` type.
- Never expose internal error messages or stack traces to the client. Log them server-side, return a generic message to the client.
- Use HTTP status codes correctly: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 500 Internal Server Error.
- Authenticate and authorize every protected route handler. Do not rely on the frontend to hide routes.

## Supabase

- Never expose the service role key to the client. Use it only in server-side code.
- Use Row Level Security (RLS) policies as the primary authorization layer. Do not rely solely on application-level checks.
- Always handle the `error` returned from Supabase calls — never ignore it.

## Error Handling

- Use `try/catch` around all async operations that touch the network or filesystem.
- Errors thrown in Server Components should be caught by the nearest `error.tsx` boundary.
- User-facing error messages must be human-readable. Codes are for logs.

## Performance

- No synchronous operations in the render/request path that can be deferred.
- Avoid creating new objects/arrays/functions inside JSX props when the component re-renders frequently. Memoize when profiling shows it matters — not preemptively.
- Use `next/image` for all images. Always provide `width`, `height`, or `fill` + a sized container.
- Lazy-load heavy client components with `dynamic(() => import(...), { ssr: false })` when they are not needed for first paint.

## Security

- Sanitize all user-generated content before rendering as HTML (`dangerouslySetInnerHTML` is almost always wrong).
- Never log passwords, tokens, or PII.
- Store secrets in environment variables only. Never commit `.env.local` or any file with real secrets.
- Prefix client-safe env vars with `NEXT_PUBLIC_`. Anything without that prefix must never be read on the client.

## Code Quality

- No `console.log` in committed code. Use a proper logger or remove debug statements before committing.
- No dead code, commented-out code, or `TODO` comments left in a PR without an associated issue.
- Keep functions under ~40 lines. If a function is longer, look for a natural extraction point.
- No magic numbers or strings. Extract them as named constants.

## Git / Commits

- Commit messages follow Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
- Each commit is a single logical change. Do not bundle unrelated changes.
- Never force-push to `main` or shared branches.
