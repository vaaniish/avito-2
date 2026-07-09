# Demo deployment

This is the shortest path for a reviewer-facing virtual stand.

## What to show

- Public frontend URL: `https://demo.example.com`
- Health check: `https://demo.example.com/health/ready`
- Demo accounts:
  - Buyer: `demo@ecomm.ru / demo123`
  - Partner: `partner@ecomm.ru / partner123`
  - Admin: `admin@ecomm.ru / admin123`

## VPS checklist

Use a small Ubuntu VPS with 2 CPU / 4 GB RAM, Node.js 22, PostgreSQL 16, Nginx, and a domain or temporary DNS name.

1. Copy the project to the VPS.
2. Create `.env` from `.env.example`.
3. Replace demo placeholders:
   - `DATABASE_URL`
   - `CORS_ALLOWED_ORIGINS`
   - `VITE_API_BASE_URL`
   - `SESSION_TOKEN_SECRET`
   - only test/sandbox external API keys
4. Install and build:

```bash
npm ci
npm run db:migrate:deploy
npm run db:seed
npm run build
```

5. Start backend with a process manager:

```bash
npm i -g pm2
pm2 start dist/backend/src/server.js --name avito-2-backend
pm2 save
```

6. Serve `dist/frontend` with Nginx and proxy backend routes.

## Nginx example

Replace `demo.example.com` and `/var/www/avito-2` with real values.

```nginx
server {
    listen 80;
    server_name demo.example.com;

    root /var/www/avito-2/dist/frontend;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:3001/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:3001/media/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

After Nginx reload:

```bash
curl -fsS https://demo.example.com/health/ready
```

## Temporary local tunnel

If there is no VPS yet, run the app locally after PostgreSQL is up:

```bash
npm run db:push
npm run db:seed
VITE_API_BASE_URL=https://YOUR-TUNNEL/api npm run build
npm run start
```

Then expose ports with a tunnel tool. This is acceptable for a quick preview, but a VPS is better because the database, backend, and static frontend stay stable after the laptop sleeps.

## Before sending the URL

- Do not send `.env` or repository archives with real secrets.
- Use sandbox payment/delivery/API keys only.
- Check `npm run build`.
- Check `curl -fsS http://127.0.0.1:3001/health/ready` on the server.
- Login once with all three demo accounts.
- Keep SSH/PostgreSQL closed to the public internet; expose only HTTP/HTTPS.
