# Showcase checklist

## GitHub About

Description:

> A playful, account-free expense splitter for trips, dinners, and shared moments. Built with React, TypeScript, FastAPI, and PostgreSQL.

Topics: `react`, `typescript`, `fastapi`, `postgresql`, `bill-splitting`, `expense-tracker`, `neon`.

Set the Website field to the verified Render URL after deployment. Keep the repository private until you choose to publish its source; a demo website can run from a private repository.

## Screenshots and demo

The README includes current desktop, mobile and receipt captures in `docs/screenshots/littletab-*.png`. They show synthetic sample-room data. Older captures in the same folder are historical and are not used in the README. Use sample data for future screenshots as well.

For a public demo, use synthetic sample data. Prefer a separate empty Neon database for demo rooms so personal rooms stay separate. Do not copy production room data into a public sample.

## Before publishing

- Review tracked files and Git history for credentials and personal data. Ignore rules do not remove previously committed secrets.
- Keep `.env.local`, `.env`, `.neon`, local databases and dependencies out of Git.
- Keep Render and Neon on their free plans and review their usage dashboards.
- Deploy and verify create/join, invite copying, expenses and receipt preview before adding the live URL.
- GitHub visibility changes, repository metadata updates and deployment are separate account actions; local documentation changes do not perform them.
