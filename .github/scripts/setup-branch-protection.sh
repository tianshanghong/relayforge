#!/bin/bash

# Script to set up branch protection rules for the main branch
# This script requires admin permissions on the repository
# Usage: ./setup-branch-protection.sh <owner> <repo>

set -e

OWNER=${1:-$(gh repo view --json owner -q .owner.login)}
REPO=${2:-$(gh repo view --json name -q .name)}

echo "Setting up branch protection for $OWNER/$REPO main branch..."

# Create branch protection rule for main branch
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/$OWNER/$REPO/branches/main/protection \
  -f "required_status_checks[strict]=true" \
  -f "required_status_checks[contexts][]=Lint" \
  -f "required_status_checks[contexts][]=Type Check" \
  -f "required_status_checks[contexts][]=Unit Tests" \
  -f "required_status_checks[contexts][]=Integration Tests" \
  -f "required_status_checks[contexts][]=Build" \
  -f "required_pull_request_reviews[dismiss_stale_reviews]=true" \
  -f "required_pull_request_reviews[required_approving_review_count]=1" \
  -f "required_pull_request_reviews[require_code_owner_reviews]=false" \
  -f "required_pull_request_reviews[require_last_push_approval]=false" \
  -f "enforce_admins=false" \
  -f "restrictions=null" \
  -f "allow_force_pushes=false" \
  -f "allow_deletions=false" \
  -f "required_conversation_resolution=true" \
  -f "lock_branch=false" \
  -f "allow_fork_syncing=true"

echo "Branch protection rules have been configured successfully!"
echo ""
echo "Summary of protection rules:"
echo "- ✅ Require status checks to pass before merging"
echo "- ✅ Require branches to be up to date before merging"
echo "- ✅ Require 1 approving review"
echo "- ✅ Dismiss stale PR approvals when new commits are pushed"
echo "- ✅ Require conversation resolution before merging"
echo "- ❌ Do not allow force pushes"
echo "- ❌ Do not allow branch deletion"