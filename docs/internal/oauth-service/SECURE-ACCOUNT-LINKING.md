# Secure Account Linking - Design Document

## Overview

This document outlines the secure approach to account linking that respects user privacy and prevents security vulnerabilities. Unlike "smart detection" systems that try to guess relationships between accounts, this approach only links accounts when users have explicitly authenticated and proven ownership.

## Core Principles

### 1. **No Guessing, No Exposure**
- NEVER suggest accounts based on email similarity
- NEVER reveal whether an email exists in the system
- ONLY link accounts the user has authenticated with

### 2. **Explicit User Consent**
- Users must OAuth authenticate to prove ownership
- Clear choices: "Create new" or "Sign in to link"
- No automatic linking without user action

### 3. **Privacy First**
- No email pattern matching
- No "Did you mean...?" suggestions
- No exposure of existing accounts

## Implementation Flow

### Scenario 1: Same Email, Different Provider

```
User has: alice@gmail.com (Google)
Logs in with: alice@gmail.com (GitHub)

System: Automatically adds GitHub to existing account
Result: One account, multiple providers
```

### Scenario 2: Different Email, Same Person

```
User has: alice@gmail.com (Google)
Logs in with: alice@company.com (GitHub)

System: Shows options:
  1. Create new account
  2. Sign in with existing account to link

If user chooses #2:
- User authenticates with Google (alice@gmail.com)
- System now has proof of ownership of both emails
- Safely links accounts
```

### Scenario 3: Accidental New Account

```
User forgot they had account with alice@gmail.com
Creates new account with alice@work.com
Later realizes mistake

Solution: Account merge flow
1. Sign into account A
2. "Merge another account" option
3. Sign into account B
4. System merges (credits, connections, etc.)
```

## API Endpoints

### 1. OAuth Callback Enhancement
```typescript
GET /oauth/:provider/callback
{
  code: string,
  state: string
}

Response variations:
// Case 1: Added to existing account
{
  "type": "provider_added",
  "sessionUrl": "...",
  "message": "GitHub added to your account"
}

// Case 2: New email, needs user decision  
{
  "type": "pending_choice",
  "pendingSessionId": "...",
  "redirectUrl": "/auth/account-choice"
}
```

### 2. Account Choice Interface
```typescript
GET /auth/account-choice?session=:pendingSessionId

// Shows UI with options:
// - Create new account
// - Sign in with: [Google] [GitHub] [Slack]
```

### 3. Complete Account Linking
```typescript
POST /api/account/complete-linking
{
  "pendingSessionId": "...",
  "existingSessionId": "..." // From second OAuth
}

Response:
{
  "success": true,
  "message": "Accounts linked successfully"
}
```

### 4. Voluntary Account Merge
```typescript
POST /api/account/merge
Headers: Authorization: Bearer {sessionId}
{
  "mergeSessionId": "..." // From signing into second account
}

Response:
{
  "success": true,
  "creditsMerged": 250,
  "providersAdded": ["github", "slack"]
}
```

## Security Benefits

### 1. **No Information Disclosure**
- Attackers can't probe for email existence
- No "similar account" hints
- Clean separation between accounts

### 2. **Proof of Ownership Required**
- Must OAuth authenticate to link
- No linking based on assumptions
- Clear audit trail

### 3. **Explicit User Intent**
- User actively chooses to link
- No accidental account merging
- Reversible through support

## Migration from Smart Detection

### Remove:
- Email similarity algorithms
- Levenshtein distance calculations  
- Domain relationship mappings
- "Suggested account" logic

### Add:
- Pending session management
- Clear account choice UI
- Voluntary merge flow
- Better audit logging

## Frontend Requirements

### 1. Account Choice Page (`/auth/account-choice`)
```tsx
interface AccountChoiceProps {
  pendingEmail: string;
  pendingProvider: string;
  onCreateNew: () => void;
  onSignInToLink: (provider: string) => void;
}

// Shows:
// "You've authenticated as alice@company.com with GitHub"
// 
// ○ Create new RelayForge account
// ● Sign in with existing account to link
//   [Continue with Google] [Continue with Slack]
```

### 2. Account Settings - Merge Section
```tsx
// In account settings:
"Account Management"
- Linked emails: alice@gmail.com, alice@company.com
- Connected providers: Google, GitHub
- [Merge another account]
```

### 3. Success Confirmation
```tsx
// After successful linking:
"✓ Accounts successfully linked!"
"Your GitHub (alice@company.com) is now connected to your account"
"All your services are accessible from one MCP endpoint"
```

## Implementation Priority

### Phase 1: Core Secure Flow ✅
- Exact email matching only
- Add provider to existing account
- Pending session for new emails

### Phase 2: Account Choice UI 🔄
- Frontend for user decision
- OAuth re-authentication flow
- Success/error handling

### Phase 3: Voluntary Merge 📋
- Merge existing accounts
- Credit combination
- Audit trail

### Phase 4: Admin Tools 📋
- Support dashboard
- Manual merge capability
- Account relationship viewing

## Conclusion

This secure approach eliminates the risks of smart detection while providing a better user experience. Users maintain full control over their accounts, privacy is protected, and the system remains simple and maintainable.

The key insight: **We should only link accounts when users have proven ownership through authentication, never through guessing.**