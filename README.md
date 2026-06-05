# Isumi Playground

Angular + Cloudflare Workers + Turso/libSQL playground for authenticated tools.

## Local setup

1. Install Node.js 24+ and npm.
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env` or export the variables used by `scripts/write-web-env.mjs`.
4. Start the web app:

```bash
npm run web:start
```

5. Start the API:

```bash
npm run api:dev
```

## Production

- Web: GitHub Pages with custom domain `playground.isumi.com.br`.
- API: Cloudflare Workers at `playground-api.isumi.com.br`.
- Database: Turso/libSQL migrations in `db/migrations`.

Configure GitHub repository secrets for the workflows before deploying.
