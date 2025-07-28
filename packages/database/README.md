# @relayforge/database

Database package for RelayForge using PostgreSQL and Prisma.

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Set up database:
```bash
pnpm db:push     # Push schema to database
pnpm db:seed     # Seed initial data
```

## Development

```bash
pnpm dev         # Watch mode for TypeScript
pnpm db:studio   # Open Prisma Studio
```

## Testing

```bash
pnpm test              # Run all tests once
pnpm test:watch        # Run tests in watch mode
pnpm test:performance  # Run performance tests
pnpm test:coverage     # Run tests with coverage
```

## Documentation

We follow a pragmatic documentation approach:
- **Schema**: The Prisma schema file is the source of truth
- **ERD**: Can be visualized with Prisma Studio
- **Behavior**: Tests serve as living documentation
- **Backup**: Standard PostgreSQL backup/restore procedures apply

## Key Features

- ✅ AES-256-GCM encryption for OAuth tokens
- ✅ Secure session management
- ✅ Account linking across multiple OAuth providers
- ✅ Usage tracking for billing
- ✅ Sub-10ms query performance
- ✅ Comprehensive test coverage (135+ tests)