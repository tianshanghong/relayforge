# Account Linking Recommendation

## Current State Analysis

After reviewing the codebase, I found:

### 1. **OAuth Service Implementation (✅ Good)**
The current `oauth.service.ts` implementation:
- Uses **exact email matching only**
- Does NOT implement smart detection
- Already follows secure practices

```typescript
// Current implementation in findOrCreateUserInTransaction
const existingUser = await tx.user.findFirst({
  where: {
    linkedEmails: {
      some: {
        email: email.toLowerCase(), // Exact match only!
      },
    },
  },
});
```

### 2. **Smart Detection Code (⚠️ Not Used)**
The `account-linking.ts` file contains:
- Email similarity algorithms (Levenshtein distance)
- Domain matching logic
- "Fuzzy" account detection

**This code is not integrated and should not be used.**

## Recommendation

### 1. **Keep Current OAuth Flow**
The existing implementation is secure and correct:
- Exact email matching
- Automatic provider addition when email matches
- New account creation when email doesn't match

### 2. **Add User Choice for Different Emails**

When user authenticates with a different email, provide options:

```typescript
// Enhancement to OAuth callback
if (emailDoesNotExist) {
  // Store pending OAuth data
  const pendingSession = await createPendingOAuthSession({
    email: userInfo.email,
    provider,
    tokens,
    expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
  });

  return {
    type: 'account_choice_required',
    pendingSessionId: pendingSession.id,
    redirectUrl: `/auth/account-choice?session=${pendingSession.id}`
  };
}
```

### 3. **Remove Smart Detection Code**
Delete or archive:
- `src/utils/account-linking.ts` (the complex similarity matching)
- `tests/account-linking.test.ts` (tests for smart detection)
- `ACCOUNT-LINKING.md` (documentation for smart approach)

Replace with:
- `src/utils/secure-account-linking.ts` (simple, secure approach)
- `tests/secure-account-linking.test.ts` (tests for secure flow)
- `SECURE-ACCOUNT-LINKING.md` (documentation for secure approach)

## Implementation Plan

### Phase 1: Account Choice UI (Priority: High)
```
User authenticates with alice@company.com
System doesn't find this email
→ Redirect to account choice page:
  
  ○ Create new RelayForge account
  ● Sign in to link to existing account
     [Continue with Google] [Continue with GitHub]
```

### Phase 2: Voluntary Account Merge (Priority: Medium)
```
User realizes they have two accounts
→ Sign into account A
→ Account settings > "Merge another account"
→ Sign into account B
→ Confirm merge
→ Credits and services combined
```

### Phase 3: Clean Up (Priority: Low)
- Remove unused smart detection code
- Update documentation
- Add audit logging for account operations

## Security Benefits

### Current Approach Maintains:
1. **No information disclosure** - Can't probe for accounts
2. **Explicit consent** - User must authenticate both accounts
3. **Simple implementation** - Less code, fewer bugs
4. **Clear user intent** - No guessing or assumptions

## Code to Add

### 1. Pending Session Storage
```typescript
// Could use Redis or a PendingOAuthSession table
interface PendingOAuthSession {
  id: string;
  email: string;
  provider: string;
  encryptedTokens: string;
  expiresAt: Date;
}
```

### 2. Account Choice Handler
```typescript
async function handleAccountChoice(
  pendingSessionId: string,
  userChoice: 'create_new' | 'link_existing',
  existingSessionId?: string
) {
  const pending = await getPendingSession(pendingSessionId);
  
  if (userChoice === 'create_new') {
    // Create new account with pending OAuth data
    return createNewAccount(pending);
  } else {
    // User authenticated with existing account
    // Add pending OAuth to existing account
    return addOAuthToExistingAccount(existingSessionId, pending);
  }
}
```

## Summary

The current OAuth implementation is already secure and doesn't use smart detection. We should:

1. **Keep the current exact-match approach**
2. **Add explicit user choice for different emails**
3. **Remove the unused smart detection code**
4. **Implement voluntary account merging**

This provides the best balance of security, privacy, and user experience.