# Verified Neon setup

Target: the locally linked Neon project and production branch. No new paid plan, app authentication service, or website publication was requested or performed.

## Changes

- Ran the supplied Neon initialization. It installed agent tooling, linked the existing project and created `neon.ts`, root npm dependencies, and ignored local Neon metadata.
- Used the requested `npx neon@latest` fallback because global npm installation was denied under `C:\Program Files\nodejs` (EPERM). Browser sign-in then completed successfully.
- `neon config plan` and `neon deploy` both reported the production branch already matches the Postgres-only policy. Deployment pulled five managed environment variables into ignored `.env.local`.
- Added a root `npm run build`, `npm test`, and `npm start`. Start runs the existing FastAPI server and compiled React app, with `.env` / `.env.local` loading on the backend only. Existing process environment variables retain priority.
- Kept native psycopg + SQLAlchemy, suitable for the long-running Python server. No browser database credentials or unnecessary JavaScript database driver were introduced.
- Fixed a real PostgreSQL portability issue found by the live test: psycopg's affected-row count was not reliable for the atomic upsert. Join limiting and optimistic writes now inspect `RETURNING` rows. This prevents incorrect 429 responses and keeps conflict detection intact.
- Added `scripts/verify_neon.py`. Its temporary room is uniquely named and removed in cleanup. It does not clear tables or alter existing rooms.

## Observed command output

```text
npx --yes neon@latest config plan
→ Planning against branch production
Utilized services: Postgres
No changes — branch production already matches the policy.
```

```text
npx --yes neon@latest deploy
→ Applying to branch production
No changes — branch production already matches the policy.
Utilized services: Postgres
Pulled 5 Neon variables into .env.local
```

```text
npm run build
> build
> npm run build --prefix frontend
> littletab@1.0.0 build
> tsc -b && vite build
✓ built in 2.16s
```

```text
npm test
Test Files  2 passed (2)
Tests  13 passed (13)
```

```text
.\.venv\Scripts\python.exe -m pytest backend/tests -q
17 passed, 1 warning in 3.84s
```

The warning is Starlette's existing test-client deprecation notice for httpx. No regular pytest test was pointed at the production Neon database.

```text
PORT=8011 npm start
INFO: Application startup complete.
INFO: Uvicorn running on http://127.0.0.1:8011
```

On Windows, set the port first with `$env:PORT='8011'`, then run `npm start`.

```text
.\.venv\Scripts\python.exe scripts/verify_neon.py
Neon PostgreSQL connection: OK (TLS)
Running app frontend + API health: 200 OK
Create room: 201
Join room and choose a new person: 200
Save and reload custom-split expense: 200
Direct Neon persistence check: OK
Delete only the verification room: 204
Neon end-to-end verification: PASS
```

## Resolved failures and limitations

- Global CLI installation: EPERM; the requested npx fallback succeeded.
- Initialization warned that GitHub Copilot CLI was absent; it installed the skills/MCP fallback. Codex and VS Code Neon plugins were installed successfully.
- The first smoke-test attempt used an unavailable psycopg TLS-status attribute. The script now checks `connection.pgconn.ssl_in_use`.
- The next live test exposed the real affected-row-count issue described above. It was fixed, all regression tests passed, and the complete live flow passed afterward.
- Browser sign-in succeeded; no remaining authentication failure.
- Database connection URLs, passwords and CLI credentials are excluded from this report and Git.
- The app is not published on Render. Neon deployment provisions/configures database services; it does not host this React/FastAPI website. Follow DEPLOY.md for the web-hosting step.
- Local SQLite data was left intact and was not uploaded into Neon.
- Code changes remain local until committed and pushed. Do not commit `.env.local` or `.neon`.
