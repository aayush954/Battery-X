# BATTERYX-X

## Intelligent Battery Circularity Digital Twin

**Final merged build:** updated BATTERYX-X interface + PostgreSQL + Prisma + Express + RBAC + lifecycle traceability + hash-chain integrity + decision support + recycling/material provenance + Docker.

This build merges the functionality of the updated BATTERYX-X ZIP with the original full Database Systems implementation. The updated UI is served by the Express backend, while all persistent application data is stored in PostgreSQL through Prisma.

> Academic prototype. It is not a certified safety, engineering, regulatory, or battery-health determination system.

## Architecture

```text
User
  ↓
Updated BATTERYX-X Web UI (public/)
  ↓
Express REST API
  ↓
Authentication / RBAC / Validation
  ↓
Business Logic
  ├── Lifecycle + hash chain
  ├── Condition / health history
  ├── Ownership / vehicle traceability
  ├── Next-life decision engine
  ├── Recycling + material provenance
  └── Audit logging / transactions
  ↓
Prisma ORM
  ↓
PostgreSQL 16
```

## Database

The Prisma schema contains the original relational design:

- roles
- users
- organizations
- manufacturers
- battery models
- batteries
- vehicles
- battery installations
- ownership transfers
- battery health records
- maintenance records
- lifecycle events
- second-life assessments
- recycling batches
- recovered materials
- audit logs

The lifecycle event history is append-only and hash-linked:

```text
previousEventHash + eventData
            ↓
          SHA-256
            ↓
        eventHash
```

This is **tamper-evident hash chaining, not blockchain**.

## Updated website functionality

- Login with username or email
- Public OWNER signup
- Dashboard with live PostgreSQL statistics
- Battery search/filter/pagination
- Add battery
- Edit battery
- Update battery condition while preserving health history
- Remove/retire battery while preserving history
- Digital Battery Passport
- Serial → vehicle traceability
- Lifecycle history and integrity status
- Battery risk score and end-of-life estimate
- What-if simulator
- Recycling Center
- Recovered-material tracking
- Admin user management
- Audit log
- Account settings / password change

## Docker

Prerequisite: Docker Desktop with WSL 2 on Windows.

Start the complete system:

```cmd
docker compose up --build
```

The backend container automatically:

1. waits for PostgreSQL health
2. applies the Prisma schema with `prisma db push`
3. seeds the sample database if it is empty
4. starts the BATTERYX-X web/API server

Open:

```text
http://localhost:5173
```

PostgreSQL is exposed at:

```text
localhost:5432
```

Stop:

```cmd
docker compose down
```

Reset the database completely:

```cmd
docker compose down -v
docker compose up --build
```

## Seed accounts

All sample accounts use:

```text
Password123!
```

| Email | Username | Role |
|---|---|---|
| admin@batteryx.dev | admin | ADMIN |
| owner@batteryx.dev | owner | OWNER |
| recycler@batteryx.dev | recycler | RECYCLER |
| auditor@batteryx.dev | auditor | AUDITOR |
| manufacturer@batteryx.dev | manufacturer | MANUFACTURER |

## Important implementation detail

The updated ZIP originally used a JSON file as its persistence layer. In this merged build, that JSON persistence is **not used**. The same updated web experience is connected to the original PostgreSQL/Prisma relational database.

Therefore, do not run the old root `server.js` from the simplified ZIP. Start the merged system with Docker Compose or `node backend/src/server.js` after configuring PostgreSQL.

## Project structure

```text
batteryx-x/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config/db.js
│   │   ├── middleware/
│   │   ├── routes/
│   │   │   ├── compat.routes.js
│   │   │   ├── lifecycle.routes.js
│   │   │   ├── ownership.routes.js
│   │   │   ├── secondlife.routes.js
│   │   │   ├── materials.routes.js
│   │   │   └── simulation.routes.js
│   │   └── utils/
│   │       ├── hashChain.js
│   │       └── decisionEngine.js
│   ├── Dockerfile
│   └── package.json
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── database/
│   ├── views.sql
│   ├── triggers.sql
│   ├── functions.sql
│   ├── sample_queries.sql
│   ├── backup.sh
│   └── restore.sh
├── docker-compose.yml
└── package.json
```

## Database Systems concepts demonstrated

The project demonstrates relational modeling, primary/foreign keys, normalization, constraints, indexes, joins through Prisma relations, aggregate queries, GROUP BY, transactions, views, triggers, stored functions, audit logging, and hash-linked lifecycle records.

Ownership transfer is transactional:

```text
Verify battery + new owner
        ↓
Create ownership transfer
        ↓
Update current owner
        ↓
Create lifecycle event
        ↓
Create audit record
        ↓
COMMIT
```

If a step fails, the transaction rolls back so the database does not contain a partially completed ownership transfer.
