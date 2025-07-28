# Turbo Remote Caching Setup Guide

## Overview
Turbo remote caching speeds up your CI/CD pipelines by sharing build artifacts across different CI runs and team members. When enabled, Turbo can reuse previously built outputs instead of rebuilding from scratch.

## Benefits
- **Faster CI builds**: Reuse artifacts from previous runs
- **Local development speed**: Share cache with your team
- **Cost savings**: Reduce CI compute time

## Setup Instructions

### 1. Create a Vercel Account
Remote caching is provided by Vercel (the creators of Turbo):
1. Go to https://vercel.com/signup
2. Create a free account

### 2. Generate Remote Cache Token
1. Visit https://vercel.com/account/tokens
2. Click "Create Token"
3. Name it (e.g., "RelayForge Turbo Cache")
4. Copy the token value

### 3. Get Your Team ID
1. Go to https://vercel.com/account
2. Find your team/username in the URL or settings
3. This is your TURBO_TEAM value

### 4. Configure GitHub Secrets
Add these secrets to your repository:
1. Go to Settings → Secrets and variables → Actions
2. Add new repository secrets:
   - `TURBO_TOKEN`: Your token from step 2
   - `TURBO_TEAM`: Your team ID from step 3

### 5. Local Development (Optional)
To use remote caching locally:

```bash
# Add to your .env or shell profile
export TURBO_TOKEN="your-token-here"
export TURBO_TEAM="your-team-id"

# Or use inline for a single command
TURBO_TOKEN="..." TURBO_TEAM="..." pnpm build
```

## Verification
Check if remote caching is working:
1. Run a build: `pnpm build`
2. Run again: `pnpm build`
3. You should see `>>> FULL TURBO` indicating cache hits

## Security Notes
- Never commit tokens to source control
- Rotate tokens periodically
- Use different tokens for CI vs local development

## Troubleshooting
- **No cache hits**: Ensure TURBO_TOKEN and TURBO_TEAM are set correctly
- **Permission errors**: Check token has correct permissions
- **Slow cache**: May be network related, remote caching works best with fast internet

## Cost
- Free tier includes 1GB of remote cache storage
- Suitable for most small to medium projects
- Paid plans available for larger teams

## Disabling Remote Cache
To disable temporarily:
```bash
pnpm build --no-daemon --no-cache
```

Or set environment variable:
```bash
TURBO_REMOTE_CACHE_DISABLED=1 pnpm build
```