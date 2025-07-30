# Secure Account Linking Flow - Visual Guide

## Current Implementation (Already Secure ✅)

```
User with alice@gmail.com account exists
    ↓
User signs in with GitHub (alice@gmail.com)
    ↓
System: "Email matches! Adding GitHub to your account"
    ↓
Result: One account, multiple providers
```

## Problem Scenario

```
User with alice@gmail.com account exists
    ↓
User signs in with GitHub (alice@company.com)
    ↓
System: "New email - what should we do?"
```

## Secure Solution (To Be Implemented)

### Step 1: User Authenticates with New Email
```
OAuth Flow:
GitHub Login → alice@company.com → OAuth Success
                                         ↓
                                  Store in Pending Session
                                  (tokens, email, provider)
                                         ↓
                                  Redirect to Choice Page
```

### Step 2: User Makes Explicit Choice
```
┌─────────────────────────────────────────────┐
│          Account Options                     │
│                                              │
│  You've signed in as alice@company.com      │
│  with GitHub.                                │
│                                              │
│  What would you like to do?                 │
│                                              │
│  ○ Create new RelayForge account            │
│                                              │
│  ● Link to existing account                 │
│     ┌─────────────────────────┐             │
│     │ Continue with Google    │             │
│     └─────────────────────────┘             │
│                                              │
└─────────────────────────────────────────────┘
```

### Step 3A: Create New Account
```
User selects "Create new account"
    ↓
System creates account with alice@company.com
    ↓
Applies pending GitHub OAuth
    ↓
New separate account created
```

### Step 3B: Link to Existing
```
User selects "Continue with Google"
    ↓
OAuth with Google → alice@gmail.com
    ↓
System: "Great! You own both emails"
    ↓
Adds GitHub (alice@company.com) to existing account
    ↓
One account with both emails
```

## What We DON'T Do (No Smart Detection ❌)

```
WRONG APPROACH:
alice@company.com authenticates
    ↓
System: "We found alice@gmail.com - is this you?"  ❌ Privacy leak!
System: "Similar to alison@company.com"           ❌ Wrong person!
System: "Looks like alice99@company.com"          ❌ Guessing!
```

## Account State Examples

### Example 1: Single Email, Multiple Providers
```json
{
  "userId": "123",
  "primaryEmail": "alice@gmail.com",
  "linkedEmails": [
    { "email": "alice@gmail.com", "provider": "google" }
  ],
  "oauthConnections": [
    { "provider": "google", "email": "alice@gmail.com" },
    { "provider": "github", "email": "alice@gmail.com" },
    { "provider": "slack", "email": "alice@gmail.com" }
  ]
}
```

### Example 2: Multiple Emails (After Linking)
```json
{
  "userId": "123",
  "primaryEmail": "alice@gmail.com",
  "linkedEmails": [
    { "email": "alice@gmail.com", "provider": "google" },
    { "email": "alice@company.com", "provider": "github" },
    { "email": "alice@team.slack.com", "provider": "slack" }
  ],
  "oauthConnections": [
    { "provider": "google", "email": "alice@gmail.com" },
    { "provider": "github", "email": "alice@company.com" },
    { "provider": "slack", "email": "alice@team.slack.com" }
  ]
}
```

## Voluntary Account Merge Flow

```
User realizes they have 2 accounts
    ↓
Signs into Account A
    ↓
Settings → "Merge another account"
    ↓
Signs into Account B (proves ownership)
    ↓
┌─────────────────────────────────────────────┐
│           Confirm Account Merge              │
│                                              │
│  Merge these accounts?                       │
│                                              │
│  Keep: alice@gmail.com (300 credits)        │
│    - Google, GitHub connected                │
│                                              │
│  Merge: alice@work.com (200 credits)        │
│    - Slack, Jira connected                   │
│                                              │
│  After merge:                                │
│  - 500 total credits                         │
│  - All services available                    │
│  - alice@work.com account deleted           │
│                                              │
│  [Cancel]            [Confirm Merge]         │
└─────────────────────────────────────────────┘
```

## Key Principles

1. **Never Guess** - No similarity matching
2. **Always Verify** - User must OAuth to prove ownership  
3. **Explicit Consent** - Clear choices, no automatic linking
4. **Privacy First** - Never reveal account existence

## Implementation Status

- ✅ Exact email matching (already implemented)
- ✅ Add provider to same email (already implemented)
- 🔄 Account choice UI (needs implementation)
- 🔄 Voluntary merge flow (needs implementation)
- ❌ Smart detection (should NOT implement)