# Duck Pond

A shared watercolor pond: every visitor is a duck, letters travel in bottles you can fish out, and kept bottles pile up on your beach.

- Frontend: plain ES modules in `public/` (canvas art layers).
- Backend: Express in `server.js`, JSON APIs under `/api`.
- Database: Postgres when `DATABASE_URL` is set (e.g. Supabase), SQLite in `DATA_DIR` otherwise.

```bash
npm install
npm start                      # http://localhost:3000, SQLite in ./data
DATABASE_URL=postgres://... npm start
```

Deploys to Vercel as-is (`vercel.json`, `api/index.js`); set `SUPABASE_DB_URL` (or `DATABASE_URL`) in the project env.
