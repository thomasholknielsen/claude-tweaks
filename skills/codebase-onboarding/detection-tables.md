# Phase 1: Detection Tables

Reference tables for codebase reconnaissance. Each detection step runs in parallel using glob/grep operations.

## 1b: Stack Detection

Analyze package manifests, lock files, and config files to build a stack profile.

| Signal File(s) | Detects |
|---|---|
| `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json` | JS/TS monorepo tooling |
| `tsconfig.json` | TypeScript config (strict mode, paths, module resolution) |
| `next.config.*`, `nuxt.config.*`, `vite.config.*`, `svelte.config.*`, `astro.config.*`, `remix.config.*` | Web framework |
| `angular.json` | Angular |
| `app.json`, `expo` in deps | React Native / Expo |
| `manifest.json` (with `manifest_version`) | Browser extension |
| `requirements.txt`, `pyproject.toml`, `Pipfile`, `setup.py`, `uv.lock` | Python stack |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `Gemfile` | Ruby |
| `pom.xml`, `build.gradle`, `build.gradle.kts` | Java/Kotlin |
| `.csproj`, `*.sln`, `global.json` | .NET |
| `mix.exs` | Elixir |
| `Package.swift` | Swift |
| `docker-compose.yml`, `Dockerfile`, `compose.yaml` | Containerization |
| `terraform/`, `*.tf` | Terraform IaC |
| `pulumi/`, `Pulumi.yaml` | Pulumi IaC |
| `cdk.json` | AWS CDK |
| `.env.example`, `.env.local`, `.env.sample` | Environment variable patterns |

For each detected technology, note the **version** (from lock file or config).

## 1c: Architecture Detection

```
Detect:
- Directory structure (flat vs layered vs feature-based vs domain-driven)
- API layer (REST, GraphQL, tRPC, gRPC — check routes, resolvers, routers)
- Database (ORM config: Prisma schema, Drizzle config, TypeORM entities,
  SQLAlchemy models, ActiveRecord migrations, EF Core, GORM, Ecto)
- Auth (NextAuth/Auth.js, Passport, custom JWT, OAuth, Keycloak, Auth0,
  Clerk, Supabase Auth, Firebase Auth, Lucia)
- State management (Redux, Zustand, MobX, Jotai, Recoil, Pinia, Vuex, Signals)
- Styling (Tailwind config, CSS modules, styled-components, Sass, Emotion, Panda CSS)
- Queue/messaging (Bull, BullMQ, SQS, Service Bus, RabbitMQ, Kafka, Celery, Sidekiq)
- Caching (Redis config, Memcached, in-memory patterns)
- Search (Elasticsearch, OpenSearch, Algolia, Meilisearch, Typesense, AI Search)
- Realtime (Socket.io, SignalR, Pusher, Ably, SSE, Phoenix Channels, ActionCable)
- AI/ML (OpenAI, Anthropic, HuggingFace, Vercel AI SDK, LangChain, LlamaIndex)
- Observability (Sentry, DataDog, New Relic, Application Insights, Pino, Winston,
  structlog, OpenTelemetry)
- Payments (Stripe, Paddle, LemonSqueezy — check for webhook handlers)
- Email (SendGrid, Resend, Postmark, SES, Mailgun — check for templates)
```

## 1d: Convention Detection

Scan for patterns the team actually follows (not what they aspire to). Sample **at least 5 files** per pattern to distinguish one-off deviations from real conventions.

```
Detect:
- Naming: files (PascalCase vs kebab-case vs camelCase), DB tables, API routes
- Exports: default vs named (grep for "export default" frequency)
- Error handling: custom error classes, error boundaries, try/catch patterns,
  Result types, Either monads
- Validation: Zod, Yup, Joi, class-validator, io-ts, Valibot, ArkType
- Logging: structured vs console.log, logger library and call signature
- Testing: framework (Jest, Vitest, Pytest, Go test, RSpec, ExUnit),
  co-located vs separate test dirs, naming convention (.test.ts, .spec.ts, _test.go)
- Linting: ESLint/Biome config, Prettier, custom rules, auto-fix on save
- Git: conventional commits (check recent 20 commit messages), branch naming,
  PR templates, CODEOWNERS
- Code organization: barrel exports (index.ts), shared utils location,
  constants/config patterns, dependency injection
- Import style: absolute vs relative, path aliases, barrel re-exports
```

## 1e: Workflow Detection

```
Detect:
- CI/CD pipeline (what it runs: lint, test, build, deploy, type check)
- Deployment target (Vercel, AWS, Azure, GCP, Fly.io, Railway, Render, Netlify,
  Cloudflare, self-hosted k8s)
- Database migrations (tool + location of migration files)
- Seeding (seed scripts, fixture data)
- Environment management (how many envs, how secrets are managed)
- Pre-commit hooks (Husky, lint-staged, lefthook)
- Package scripts (all scripts in root package.json + key workspace scripts)
- Release process (semantic-release, changesets, manual tags)
```

## 1f: Pain Point Detection

Look for signs of technical debt or friction:

```
Detect:
- TODO/FIXME/HACK comments (count and categorize top 5 themes)
- Disabled lint rules (eslint-disable counts by rule — top 10)
- Type assertions (as any, as unknown, @ts-ignore, @ts-expect-error — counts + hotspot files)
- Dead code signals (unused exports, commented-out code blocks >5 lines)
- Dependency freshness (major versions behind on key deps)
- Test coverage gaps (dirs with code but no tests — list the dirs)
- Missing types (JS files in a TS project, untyped areas)
- Copy-paste patterns (near-duplicate files or functions — sample 3 if found)
- Inconsistency signals (same thing done 2+ different ways — e.g., both fetch and axios,
  both default and named exports in similar files)
```

## 1g: Existing AI Configuration (Initial Mode only)

Check for non-Claude AI config that might contain useful conventions to migrate:

```
Detect:
- .cursorrules, .cursor/ (Cursor IDE rules)
- .github/copilot-instructions.md (GitHub Copilot)
- .ai/, .aider*, coderabbit.yaml (other AI tools)
- Any of these contain useful conventions to preserve or migrate
```

If found, ask the user whether to **migrate and enhance** or **ignore**.
