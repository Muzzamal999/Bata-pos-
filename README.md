# BATA POS

Multi-tenant Point of Sale platform for BATA Footwear, built as four DDD-oriented microservices with dedicated frontend apps.

## Structure

```
BATA-POS/
│
├── services/
│   ├── identity-organization/   # Service 1 - auth, users, roles, tenants, branches (NestJS, :3001)
│   ├── product-inventory/       # Service 2 - products, variants, pricing, inventory, transfers (NestJS, :3002)
│   ├── sales-pos/                # Service 3 - checkout, refunds, shifts, catalog cache (NestJS, :3004)
│   └── reporting-integration/    # Service 4 - reporting, analytics, audit, integration adapters (NestJS, :3003)
│
├── apps/
│   ├── web-admin/        # Admin console (Next.js, :3005) - auth + dashboard shell implemented
│   ├── web-pos/          # not yet implemented (planned :3006)
│   └── storefront/       # not yet implemented (planned :3007)
│
├── infrastructure/
│   ├── docker/
│   ├── rabbitmq/
│   └── redis/
│
├── packages/
│   ├── shared-types/     # TypeScript types mirroring each backend service's real DTOs
│   ├── shared-config/
│   └── api-clients/      # Per-service Axios clients with auth-attach and 401 refresh-retry
│
├── docker-compose.yml
├── package.json          # npm workspaces root (apps/*, packages/*)
└── README.md
```

## Status

All four backend services are implemented and fully tested (see each service's own `test/` suite).

Frontend: `web-admin` has its foundation, authentication, and dashboard shell (sidebar/topbar/theming) implemented and verified against the real Identity service. Admin feature modules (branches, users, products, inventory, transfers, reports, settings) are not yet built. `web-pos` and `storefront` are not yet started.

## Running locally

```bash
docker compose up -d                  # Postgres x4, Redis, RabbitMQ
# in each services/<name> directory: npm install && npm run build && node dist/main.js
cd apps/web-admin && npm run dev      # http://localhost:3005
```

Each backend service enables CORS for the three local frontend dev ports (3005/3006/3007) only - see `CORS_ORIGINS` in each service's `main.ts`.
