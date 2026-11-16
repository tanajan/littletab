# Deploy Littletab for free

Use **Render Free for the app** and **Neon Free for PostgreSQL**. The existing React/TypeScript + FastAPI + PostgreSQL stack stays the same. The root Dockerfile builds the frontend and serves it from FastAPI, so you only need one web service.

Nothing has been published. These services can cost nothing while you remain within their free allowances; free hosting is not unlimited or always awake.

## 1. Create the free database

1. Sign up at [Neon](https://neon.com/) and create a project on its **Free** plan. Pick a European region near Frankfurt if available.
2. Open **Connect** and copy the PostgreSQL connection string. Copy just the URL beginning `postgresql://`, not a surrounding `psql` command. Keep its SSL query parameters, such as `sslmode=require`.
3. Keep this URL private. You will paste it into Render, not into source code or a frontend environment variable.

[Neon's pricing page](https://neon.com/pricing) describes the Free plan as $0 with no time limit and no credit card required. It has storage, compute and transfer allowances. Keep the project on Free; no upgrade is needed to try Littletab with friends.

## 2. Put the project in GitHub

Create a **private GitHub repository** and push this project. Include the root `Dockerfile`, `render.yaml`, `frontend`, and `backend`. The supplied `.gitignore` excludes `.env` files, local databases, dependencies and the Python environment. Do not upload those excluded files manually.

## 3. Deploy the free app

1. Sign in to [Render](https://dashboard.render.com/) and choose **New → Blueprint**.
2. Connect the GitHub repository and choose its branch. Render reads the supplied `render.yaml`.
3. When prompted for **DATABASE_URL**, paste the Neon connection string.
4. Confirm that Render lists **one web service on the Free plan**. This Blueprint creates no Render database and no paid services.
5. Apply the Blueprint when you are ready to put the app online. The Dockerfile builds React and FastAPI together; no separate build or start commands are needed.
6. Open the HTTPS `onrender.com` URL Render supplies. Create a room, choose its PIN, then use **Invite friends → Copy link**. Share the PIN separately.

The app accepts Neon's standard PostgreSQL URL and automatically selects the installed psycopg driver. The database stays in Neon when Render sleeps or redeploys. Automatic deploys are disabled; use Render's manual deploy action after future code changes.

References: [Render's free deployment guide](https://render.com/docs/free), [Blueprint setup](https://render.com/docs/infrastructure-as-code), [Neon connection instructions](https://neon.com/docs/connect/connect-from-any-app).

## Free-tier trade-offs

- Render Free sleeps after 15 minutes without inbound traffic. The first visit after sleeping can take about a minute to start the app again. This is usually acceptable for occasional family use.
- Use **Neon Free**, rather than Render Free Postgres: Render's free database expires after 30 days. That is separate from Littletab's own 30-day room expiry.
- Both providers have usage limits. Keep the selected plans on Free and monitor their dashboards. No custom domain is needed; Render's supplied URL is sufficient.
- Expired Littletab rooms cannot be accessed after 30 days. Physical cleanup resumes when the sleeping API wakes.

## Optional local production check

With Docker Desktop installed, copy `.env.example` to `.env` and replace the database password with a long random value using letters and digits. Run:

```powershell
docker compose -f compose.production.yaml up --build -d
```

Open http://127.0.0.1:8080. This uses local PostgreSQL and remains local-only. `docker compose -f compose.production.yaml down` stops it and keeps its database volume.

## Verification status

The production frontend build and API tests have passed locally. Deployment YAML is checked for a Free web plan and no Render database resources. No Render or Neon account has been created or changed by this chat. Docker and live hosted PostgreSQL execution have not been tested on this machine.
