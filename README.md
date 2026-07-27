# TradeNexa Backend

REST API and realtime backend for the **TradeNexa** B2B marketplace — products, RFQs, inquiries, chat, notifications, and admin tools.

[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/express-4.x-lightgrey.svg)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/database-MySQL-orange.svg)](https://www.mysql.com/)
[![Socket.IO](https://img.shields.io/badge/realtime-Socket.IO-black.svg)](https://socket.io/)

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [API overview](#api-overview)
- [Authentication and roles](#authentication-and-roles)
- [Realtime (Socket.IO)](#realtime-socketio)
- [Media and uploads](#media-and-uploads)
- [Postman](#postman)
- [Code style](#code-style)
- [Architecture notes](#architecture-notes)

---

## Features

- **Phone OTP auth** via Firebase Admin (`send-otp`, `verify-otp`, `resend-otp`) plus registration with a short-lived JWT
- **Access + refresh tokens** with logout / session revoke
- **Roles**: `buyer`, `seller`, `buyer_seller`, and admin panel roles (`admin`, `super_admin`, `supporter`)
- **Marketplace modules**: categories, products (approval workflow), brands, banners, offers, sellers, wishlist
- **RFQs**: public / private visibility, seller feed (category + assigned invites), quotations
- **Product inquiries** with seller quotations and chat seeding
- **Chat** over REST + Socket.IO (typing, read receipts, presence)
- **In-app notifications** + FCM push (multi-device tokens)
- **Profile completion** (multipart) with required company fields and `category_id`
- **Admin auth**, dashboard summaries, and product review queue
- **S3 uploads** (Railway-compatible) with optional `/media` proxy for private buckets
- Security middleware: Helmet, CORS, compression, rate limiting, `express-validator`

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js `>= 20` |
| HTTP | Express 4 |
| Database | MySQL via Knex + `mysql2` |
| Auth | Firebase Admin (OTP), `jsonwebtoken`, `bcrypt` |
| Realtime | Socket.IO 4 |
| Push | Firebase Cloud Messaging |
| Storage | AWS S3 SDK (or local `uploads/` when S3 is disabled) |
| Validation | `express-validator` |
| Logging | Winston + Morgan |
| Tooling | ESLint, Prettier, Nodemon |

---

## Project structure

```text
├── app.js                 # Express app (middleware, routes, error handler)
├── server.js              # HTTP + Socket.IO bootstrap
├── knexfile.js            # Knex connection & pool
├── config/                # App, upload, S3 config
├── constants/             # Shared enums and constants
├── controllers/           # HTTP handlers
├── services/              # Business logic
├── models/                # Knex data access
├── routers/               # Route mounts under /api/v1
├── middleware/            # Auth, validation, upload, rate limit, errors
├── sockets/               # Socket.IO auth, chat, notification events
├── utils/                 # JWT, Firebase, media URLs, pagination, logger
├── database/
│   ├── knex.js            # Shared DB client
│   ├── migrations/        # Schema migrations
│   └── seeds/             # Roles, languages, locations, business types
├── postman/               # api-specs.js (collection descriptions)
├── docs/                  # Push notification guides
├── uploads/               # Local media when S3 is off
└── TradeNexa_Buyer_Home_APIs.postman_collection.json
```

Layering convention: **router → controller → service → model**. Keep business rules in `services/`; keep SQL in `models/`.

---

## Prerequisites

- Node.js 20+
- npm
- MySQL 8+ (local or managed)
- Firebase project (phone auth + FCM)
- Optional: S3-compatible bucket (e.g. Railway Bucket)

---

## Getting started

1. **Clone**

   ```bash
   git clone https://github.com/paneliyatechnology-debug/TradeNexa_Backend.git
   cd TradeNexa_Backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Fill in database, JWT secrets, and Firebase credentials. See [Environment variables](#environment-variables).

4. **Create the database** (MySQL)

   ```sql
   CREATE DATABASE tradenexa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

5. **Migrate and seed**

   ```bash
   npm run migrate
   npm run seed
   ```

6. **Run**

   ```bash
   npm run dev    # development (nodemon)
   npm start      # production
   ```

7. **Health check**

   ```bash
   curl http://localhost:3000/health
   ```

   API base path: `http://localhost:3000/api/v1`  
   Socket.IO path: `/socket.io`

---

## Environment variables

Copy from [`.env.example`](.env.example). Do **not** commit `.env`.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` \| `production` \| `test` |
| `PORT` | HTTP port (default `3000`) |
| `APP_NAME` / `APP_URL` | App identity and public API origin |
| `FRONTEND_URL` / `FRONTEND_CHAT_PATH` | Web deep links for push clicks |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | MySQL connection |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing secrets |
| `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY` / `JWT_REGISTRATION_EXPIRY` | Token lifetimes |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` / `FIREBASE_API_KEY` | OTP + FCM |
| `AWS_*` | S3 credentials, endpoint, bucket, optional public URL / prefix |
| `CORS_ORIGIN` | Comma-separated origins, or `*` |
| `RATE_LIMIT_ENABLED` / `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | Global `/api/v1` limiter |
| `UPLOAD_MAX_FILE_SIZE` / `UPLOAD_MAX_VIDEO_FILE_SIZE` | Upload caps (bytes) |
| `BCRYPT_SALT_ROUNDS` | Password / token hash cost |
| `LOG_LEVEL` / `LOG_DIR` | Winston logging |

When S3 env vars are set, uploads go to the bucket and private files are served via `GET /media/*`. Otherwise files are stored under `uploads/` and served statically.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start server |
| `npm run dev` | Start with Nodemon |
| `npm run migrate` | Run Knex migrations |
| `npm run migrate:rollback` | Roll back last migration batch |
| `npm run seed` | Run seeds |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |

---

## API overview

All REST routes are mounted under **`/api/v1`**.

| Prefix | Module |
| --- | --- |
| `/auth` | OTP, register, refresh, logout, profile |
| `/admin/auth` | Admin panel login |
| `/dashboard` | Admin / seller dashboard metrics |
| `/roles` | Roles |
| `/business-types` | Business types by role |
| `/categories` | Categories and subcategories |
| `/banners` | Home banners |
| `/products` | Catalog, seller CRUD, admin review, search history |
| `/sellers` | Seller directory and public seller products (`/suppliers` alias) |
| `/brands` | Brands |
| `/offers` | Offers |
| `/rfqs` | RFQs, seller feed, quotations, admin RFQ tools |
| `/inquiries` | Product inquiries and quotations |
| `/chats` | Conversations and messages |
| `/notifications` | In-app notification inbox |
| `/wishlist` | Buyer wishlist |
| `/locations` | Countries, states, cities |
| `/services` | Services catalog |
| `/news` | News |

Response shape (typical):

```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

List endpoints use shared pagination (`page`, `limit`, max `100`) and return `{ results, pagination }`.

For full request/response details, use the Postman collection (below). Spec text for many endpoints also lives in `postman/api-specs.js`.

---

## Authentication and roles

1. Client obtains a Firebase ID token after phone OTP.
2. `POST /api/v1/auth/verify-otp` — if the user exists, returns access + refresh tokens; otherwise a short-lived **registration** token.
3. `POST /api/v1/auth/register` — completes signup (requires registration token).
4. Protected routes: `Authorization: Bearer <access_token>`.
5. `POST /api/v1/auth/refresh-token` — rotate tokens.
6. `PUT /api/v1/auth/profile` — multipart profile completion (`category_id` required for marketplace roles).

**Marketplace roles:** `buyer` · `seller` · `buyer_seller`  
**Admin panel roles:** `admin` · `super_admin` · `supporter`

Middleware: `authenticate`, `optionalAuthenticate`, `authorize(...roles)`, `verifyRegistration`.

---

## Realtime (Socket.IO)

- Same HTTP server as Express (`server.js`)
- Path: `/socket.io`
- Auth: JWT in `handshake.auth.token`, query `token`, or `Authorization` header
- Chat events: join conversation, send message, typing, read receipts, presence
- Badge events: chat unread summary, notification unread counts (buyer / seller)

Presence and “active conversation” push suppression are **in-memory**. Run a **single app instance** until a Redis adapter is added for horizontal scaling.

---

## Media and uploads

- Profile, product, and chat uploads use Multer (`middleware/upload.js`)
- Max image / video sizes come from env (`UPLOAD_MAX_*`)
- With S3 enabled: objects stored in the bucket; private access via `GET /media/<key>`
- Without S3: files under `uploads/`, served from the configured public path

---

## Postman

1. Import [`TradeNexa_Buyer_Home_APIs.postman_collection.json`](TradeNexa_Buyer_Home_APIs.postman_collection.json)
2. Set collection variable `base_url` to `http://localhost:3000/api/v1`
3. Use `buyer_token` / `seller_token` / `admin_token` after OTP verify or admin login

Request bodies and REQUIRED/OPTIONAL fields are documented on each request. Spec generators also live in `postman/api-specs.js`.

---

## Code style

- Follow existing patterns: JSDoc on public functions, section separators, `AppError` + central error handler
- Prefer `async/await`; keep controllers thin
- Validate inputs in middleware; do not trust client-supplied role / ownership IDs
- Soft-delete with `deleted_at` where the schema uses it

```bash
npm run lint
npm run format
```

---

## Architecture notes

- Knex pool defaults to `min: 2`, `max: 10` in `knexfile.js` — raise for higher concurrency and align with MySQL `max_connections`
- Global API rate limit defaults to **on in production**, **off in development** (override with `RATE_LIMIT_ENABLED`)
- OTP and admin login always use stricter limiters
- There is no Redis or background job worker yet; long-running side effects (FCM, RFQ expiry) currently run near the request/socket path — plan workers before large-scale traffic
- Proxy: `app.set('trust proxy', 1)` so rate limits see the real client IP behind Railway / reverse proxies

---

## License

Proprietary / all rights reserved unless a `LICENSE` file is added to this repository.
