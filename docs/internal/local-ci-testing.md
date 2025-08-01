# Local CI Testing with Act

This guide explains how to test GitHub Actions workflows locally using `act` before pushing to GitHub.

## Prerequisites

1. Install Docker Desktop (required for act)
2. Install act:
   ```bash
   # macOS (using Homebrew)
   brew install act
   
   # Or using the install script
   curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
   ```

## Setup

1. Run the setup command to pull the required Docker images:
   ```bash
   pnpm test:ci:setup
   ```

2. Copy the environment file and update if needed:
   ```bash
   cp .env.act .env.act.local
   # Edit .env.act.local with your specific values if needed
   ```

## Usage

### Test Specific Jobs

To run just the unit tests job (fastest):
```bash
pnpm test:ci
```

This runs the `test` job from the PR validation workflow.

### Test Full PR Workflow

To simulate a complete PR validation:
```bash
pnpm test:ci:pr
```

This runs all jobs that would run on a pull request.

### Test All Workflows

To run all workflows (takes longer):
```bash
pnpm test:ci:full
```

### Custom Act Commands

You can also use act directly with custom options:
```bash
# List all available jobs
act -l

# Run a specific job with verbose output
act -j test -v

# Run with a specific event
act push

# Dry run (show what would be executed)
act -n
```

## Troubleshooting

### Common Issues

1. **Docker not running**: Make sure Docker Desktop is running before using act.

2. **PostgreSQL connection issues**: Act runs in Docker, so use `host.docker.internal` instead of `localhost` if needed:
   ```bash
   DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/relayforge_test
   ```

3. **Missing environment variables**: Add any missing variables to `.env.act.local`.

4. **Out of memory**: Increase Docker Desktop memory allocation in preferences.

### Debugging Tips

1. Use verbose mode to see detailed output:
   ```bash
   act -j test -v
   ```

2. Keep containers running for inspection:
   ```bash
   act -j test --rm=false
   ```

3. Use a specific platform if you encounter architecture issues:
   ```bash
   act -j test --platform linux/amd64
   ```

## Why Use Act?

1. **Catch CI-specific issues early**: Environment variables, service containers, and other CI-specific configurations can cause tests to fail in CI even when they pass locally.

2. **Faster feedback loop**: No need to push and wait for GitHub Actions to run.

3. **Cost savings**: Reduce GitHub Actions minutes by testing locally first.

4. **Debugging**: Easier to debug CI issues when you can run them locally.

## Best Practices

1. Always run `pnpm test:ci` before pushing changes that modify tests or CI configuration.

2. Keep `.env.act.local` updated with the same environment variables used in GitHub secrets.

3. If tests pass locally but fail in act, it's likely an environment issue that would also fail in GitHub Actions.

4. Use act to test workflow changes before committing them.

## Example Workflow

```bash
# 1. Make your changes
git add .

# 2. Test locally first
pnpm test

# 3. Test in CI environment
pnpm test:ci

# 4. If both pass, commit and push
git commit -m "feat: add new feature"
git push
```

This workflow helps ensure your changes will pass in the actual GitHub Actions environment.