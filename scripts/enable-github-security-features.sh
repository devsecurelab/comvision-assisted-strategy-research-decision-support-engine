#!/usr/bin/env bash
set -Eeuo pipefail

# Enable GitHub vulnerability alerts and automated security fixes.
# Requires gh authentication with repository administration:write permission.
# Usage: ./scripts/enable-github-security-features.sh [OWNER/REPO]

REPO="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
API_ROOT="repos/${REPO}"

require_gh() {
  command -v gh >/dev/null 2>&1 || {
    echo "ERROR: GitHub CLI (gh) is required." >&2
    exit 2
  }
}

api_error() {
  local operation="$1"
  local payload="$2"
  cat >&2 <<EOF
ERROR: ${operation} failed.
${payload}

For a private repository, GitHub may require GitHub Pro or an organization plan
that supports private-repository security features. Otherwise enable the feature
from Settings > Advanced Security, or make the repository public.
The authenticated token also needs repository administration write permission.
EOF
  exit 1
}

require_gh

echo "Repository: ${REPO}"
echo "Visibility: $(gh repo view "${REPO}" --json visibility --jq .visibility)"

echo "Enabling dependency graph vulnerability alerts..."
if ! response=$(gh api --method PUT "${API_ROOT}/vulnerability-alerts" 2>&1); then
  api_error "vulnerability alerts" "${response}"
fi

echo "Enabling automated security fixes..."
if ! response=$(gh api --method PUT "${API_ROOT}/automated-security-fixes" 2>&1); then
  api_error "automated security fixes" "${response}"
fi

echo "Verifying vulnerability alerts..."
if ! gh api "${API_ROOT}/vulnerability-alerts" >/dev/null; then
  api_error "vulnerability-alerts verification" "GitHub did not return an enabled response."
fi

echo "Verifying automated security fixes..."
fixes_json=$(gh api "${API_ROOT}/automated-security-fixes")
if [[ "$(jq -r '.enabled' <<<"${fixes_json}")" != "true" ]]; then
  api_error "automated security fixes verification" "${fixes_json}"
fi

printf '%s\n' "Security feature enablement and verification completed successfully."
