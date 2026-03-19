#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REPO="icocoding/manclaw"
REPO="${MANCLAW_RELEASE_REPO:-$DEFAULT_REPO}"
TARGET_DIR="."
SKIP_INSTALL="0"
USING_DEFAULT_REPO="1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      USING_DEFAULT_REPO="0"
      shift 2
      ;;
    --target-dir)
      TARGET_DIR="${2:-.}"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL="1"
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage: install-latest-release.sh [--repo owner/name] [--target-dir DIR] [--skip-install]

Download the latest ManClaw release zip from GitHub releases, extract it,
and optionally run `npm install --omit=dev`.
Default repo: icocoding/manclaw
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd curl
need_cmd unzip
need_cmd npm

detect_repo_slug() {
  if [[ -n "$REPO" ]]; then
    printf '%s\n' "$REPO"
    return 0
  fi

  local remote
  remote="$(git config --get remote.origin.url 2>/dev/null || true)"
  if [[ -z "$remote" ]]; then
    return 1
  fi

  if [[ "$remote" == git@github.com:* ]]; then
    remote="${remote#git@github.com:}"
  elif [[ "$remote" == https://github.com/* ]]; then
    remote="${remote#https://github.com/}"
  else
    return 1
  fi

  remote="${remote%.git}"
  printf '%s\n' "$remote"
}

REPO="$(detect_repo_slug || printf '%s\n' "$DEFAULT_REPO")"

if [[ -n "${MANCLAW_RELEASE_REPO:-}" ]]; then
  USING_DEFAULT_REPO="0"
fi

if [[ "$REPO" != "$DEFAULT_REPO" ]]; then
  USING_DEFAULT_REPO="0"
fi

if [[ "$USING_DEFAULT_REPO" == "1" ]]; then
  echo "Using default release repo: ${DEFAULT_REPO}" >&2
  echo "If you are installing from a fork, pass --repo owner/name or set MANCLAW_RELEASE_REPO." >&2
fi

API_URL="https://api.github.com/repos/${REPO}/releases/latest"
RELEASE_JSON="$(mktemp)"
ZIP_TMP="$(mktemp)"
trap 'rm -f "$RELEASE_JSON" "$ZIP_TMP"' EXIT

curl -fsSL \
  -H 'Accept: application/vnd.github+json' \
  -H 'User-Agent: manclaw-release-installer' \
  "$API_URL" \
  -o "$RELEASE_JSON"

RELEASE_BODY="$(tr -d '\n' < "$RELEASE_JSON")"
DOWNLOAD_URL="$(
  printf '%s' "$RELEASE_BODY" \
    | grep -Eo 'https://[^"]*manclaw-release-[^"]*\.zip' \
    | head -n 1
)"

if [[ -z "$DOWNLOAD_URL" ]]; then
  DOWNLOAD_URL="$(
    printf '%s' "$RELEASE_BODY" \
      | grep -Eo 'https://[^"]*\.zip' \
      | head -n 1
  )"
fi

ASSET_NAME="${DOWNLOAD_URL##*/}"

if [[ -z "$DOWNLOAD_URL" || -z "$ASSET_NAME" ]]; then
  echo "Failed to resolve release asset." >&2
  exit 1
fi

echo "Downloading ${DOWNLOAD_URL}"
curl -fsSL "$DOWNLOAD_URL" -o "$ZIP_TMP"

mkdir -p "$TARGET_DIR"
TARGET_DIR_ABS="$(cd "$TARGET_DIR" && pwd -P)"
TOP_LEVELS="$(
  unzip -Z1 "$ZIP_TMP" \
    | sed '/^__MACOSX\//d;/^$/d' \
    | awk -F/ '{print $1}' \
    | awk '!seen[$0]++'
)"
TOP_LEVEL_COUNT="$(printf '%s\n' "$TOP_LEVELS" | sed '/^$/d' | wc -l | tr -d ' ')"
TOP_LEVEL=""

if [[ "$TOP_LEVEL_COUNT" == "1" ]]; then
  TOP_LEVEL="$(printf '%s\n' "$TOP_LEVELS" | sed -n '1p')"
  if [[ -e "${TARGET_DIR_ABS}/${TOP_LEVEL}" ]]; then
    rm -rf "${TARGET_DIR_ABS:?}/${TOP_LEVEL}"
  fi
fi

unzip -oq "$ZIP_TMP" -d "$TARGET_DIR_ABS"

if [[ -n "$TOP_LEVEL" ]]; then
  RELEASE_DIR="${TARGET_DIR_ABS}/${TOP_LEVEL}"
else
  RELEASE_DIR="$TARGET_DIR_ABS"
fi

if [[ -z "$RELEASE_DIR" ]]; then
  echo "Failed to determine extracted release directory." >&2
  exit 1
fi

echo "Extracted to ${RELEASE_DIR}"

if [[ "$SKIP_INSTALL" != "1" ]]; then
  (cd "$RELEASE_DIR" && npm install --omit=dev)
  echo "Dependencies installed in ${RELEASE_DIR}"
fi
