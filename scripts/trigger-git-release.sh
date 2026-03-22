#!/usr/bin/env bash
set -euo pipefail

REMOTE="origin"
BRANCH="master"
MESSAGE="[release] trigger release pipeline"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)
      REMOTE="${2:-}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --message)
      MESSAGE="${2:-}"
      shift 2
      ;;
    -h|--help)
      cat <<'EOF'
Usage: trigger-git-release.sh [--remote origin] [--branch master] [--message "[release] trigger release pipeline"]

Create an empty git commit that contains [release] and push it to the target branch,
so the GitHub release workflow starts without changing source files.
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This script must be run inside a git repository." >&2
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"

if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "Unable to determine current branch." >&2
  exit 1
fi

if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  echo "Current branch is '${CURRENT_BRANCH}', expected '${BRANCH}'." >&2
  echo "Switch to '${BRANCH}' before triggering release, or pass --branch ${CURRENT_BRANCH} explicitly." >&2
  exit 1
fi

if [[ "$MESSAGE" != *"[release]"* ]]; then
  echo "Release commit message must contain [release]." >&2
  exit 1
fi

git commit --allow-empty -m "$MESSAGE"
git push "$REMOTE" "$BRANCH"

echo "Release trigger pushed to ${REMOTE}/${BRANCH}."
