# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability, please email security@relayforge.xyz instead of using the issue tracker.

## Security Best Practices for Contributors

### NEVER Commit Secrets

1. **Environment Files**: Never commit `.env` files
2. **API Keys**: Never hardcode API keys, use environment variables
3. **Credentials**: Never commit OAuth secrets, JWT secrets, or database passwords

### Before Every Commit

1. Review your changes for accidental secrets
2. Use `git diff --staged` to check what you're committing
3. Run security scanning: `gitleaks detect --source . -v`

### Setting Up Your Development Environment

1. Copy `.env.example` files, never the actual `.env` files
2. Generate your own secrets using: `pnpm run generate-env-keys`
3. Get your own OAuth credentials from providers (Google, GitHub, etc.)

### If You Accidentally Commit Secrets

1. **DO NOT** push to GitHub
2. Remove the commit: `git reset --hard HEAD~1`
3. If already pushed:
   - Immediately revoke the exposed credentials
   - Contact maintainers
   - Consider the secret permanently compromised

## Security Features

RelayForge implements several security measures:

- **Token Hashing**: All bearer tokens are hashed using SHA-256 before storage
- **Encryption**: OAuth tokens are encrypted using AES-256-GCM
- **HTTPS Only**: Production requires HTTPS for all endpoints
- **Rate Limiting**: API endpoints are rate-limited
- **CORS**: Strict CORS policies in production
- **Session Security**: HTTP-only, secure, SameSite cookies

## Dependencies

We regularly update dependencies to patch security vulnerabilities. Run `pnpm audit` to check for known issues.