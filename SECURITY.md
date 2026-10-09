# Security hardening — deployment prerequisites

This document lists what **must** be done before deploying, and what changed that
operators need to act on. It is ordered by whether a step blocks startup.

## 1. Required environment variables (the app will not boot without these)

There are **no defaults** for any of these. Each was previously allowed to fall back
to a hardcoded constant, which meant a misconfigured deployment silently used a
publicly-known key.

| Variable | How to generate | Failure mode if missing |
|---|---|---|
| `JWT_SECRET` | `openssl rand -base64 48` | Throws on first sign-in / token verify |
| `ENCRYPTION_KEY` | `openssl rand -hex 16` (64 hex chars = 32 bytes) | Throws when a provider key is stored or read |
| `DATABASE_URL` | your DSN | Throws when the connection pool is constructed |
| `INTERNAL_API_SECRET` | `openssl rand -hex 32` | Headless callers rejected; no default |
| `API_SECRET` | `openssl rand -hex 32` | Optional — empty disables the credential entirely |

## 2. Rotate before first deploy

Two secrets were committed to git history and were used whenever the corresponding
variable was unset. They must be considered compromised, and choosing a *new* value is
required — the old ones are known to anyone with repository access.

- **`ENCRYPTION_KEY`** — this one decrypts data, so treat it as a real incident.
  Every tenant's stored Groq / OpenAI / OpenRouter / Anthropic / DeepSeek key was
  encrypted under the committed constant. If any non-production instance ever stored
  real keys, rotate the affected provider keys at the provider as well.
  Existing ciphertext cannot be read with a new `ENCRYPTION_KEY`, so re-encrypt stored
  keys before rotating, or accept re-entry.
- **`JWT_SECRET`** — rotate to invalidate any session cookies signed with the old key.
  All users will need to sign in again. This is the cheap, correct action.
- **A prior internal service credential literal** — `hasValidApiSecret` no longer
  accepts any literal, but if that value was ever a real shared secret anywhere,
  rotate it there too.

## 3. Feature flags that now default to off

| Flag | Default | Notes |
|---|---|---|
| `ENABLE_DEMO_LOGIN` | off (404) | `/api/auth/demo` mints a 7-day session for an anonymous caller. Hard-refused in production regardless of this flag. |
| `ENABLE_SANDBOX_EXECUTION` | off (404) | `/api/sandbox/execute` runs submitted Python **as the app process**. There is no OS-level isolation; the denylist is defence in depth, not a boundary. Only enable it if you genuinely need it, and only with admin/reviewer role gating in place. |

`docker-compose.yml` now forwards both flags explicitly as `false` so a host
environment cannot turn them on accidentally.

## 4. What changed in the tenant boundary

The recurring failure mode was a route re-deriving its own weaker check instead of
using the guard. If you add a route, use these and do not re-implement them:

- `requireTenantSession(req)` — authenticate. Verifies the JWT signature **and** that a
  live, unexpired `userSession` row exists, so a signed-out cookie cannot be replayed.
- `canAccessTenantRecord(session, record)` — authorise. Admins are **not** org
  superusers; only the API_SECRET platform-operator identity crosses tenants. A record
  with `orgId: null` is operator-only.
- `assertPlanOwnership(session, planId)` — for anything keyed by a caller-supplied
  `planId`.
- `hasRole(session, ...roles)` / `roleForbidden(role)` — for actions that need a role,
  not just tenancy.

If a query is keyed by an id from the request, ownership must be proven **from the row**
before any read, write, or existence check that could leak.

## 5. Rate limiting

Added at sign-in (per-IP and per-account), report render, and sandbox execute. Two
limitations are deliberate and stated in the source:

- State is **per-process**. With more than one instance the effective limit is
  `limit x instances`. A shared store (Redis) is needed for a true global limit.
- The window is **fixed**, so a caller may burst up to 2x the limit across a boundary.

## 6. Security headers

`next.config.ts` now sets a CSP, `X-Frame-Options: DENY`, `frame-ancestors 'none'`,
HSTS, `X-Content-Type-Options: nosniff`, a strict `Referrer-Policy`, a restrictive
`Permissions-Policy`, and `poweredByHeader: false`.

`/temp/reports/*` additionally gets `default-src 'none'` plus `sandbox`, so generated
report HTML cannot execute script even if an escaping bug is reintroduced.

`script-src` retains `'unsafe-inline'` for the app shell because Next.js injects inline
bootstrap JSON. If you later remove that requirement, tighten it.

## 7. CI

`.github/workflows/ci.yml` runs the secret scan first (fast, and it would have caught
the two committed credentials), then typecheck, lint, unit tests, and a high-severity
dependency audit. E2E runs on `main` with Postgres and two repository secrets
(`CI_JWT_SECRET`, `CI_ENCRYPTION_KEY`) — add them under Settings → Secrets, or the E2E
job will fail deliberately rather than silently using a default.

The Next.js version in this repository is behind and long out of support; the tenant
boundary depends on framework behaviour, so treat the upgrade as a security task rather
than routine dependency maintenance.

## 8. What was reviewed and found clean

Recorded so the next reviewer does not repeat the work: no SQL injection (both
`$queryRaw` sites use Prisma tagged templates), no `dangerouslySetInnerHTML`, no
`eval`/`new Function`, no `NEXT_PUBLIC_*` secret, `.env` correctly gitignored and
untracked, `/api/settings/keys` returns only a boolean, `/api/upload` has a size cap
and extension allowlist and never writes the uploaded binary to disk, and all outbound
`fetch()` calls use hardcoded hosts (the one generic fetcher now has an explicit host
allowlist and does not follow redirects).