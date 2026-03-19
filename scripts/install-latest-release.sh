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
need_cmd python3
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

readarray -t RELEASE_INFO < <(
  python3 - "$RELEASE_JSON" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    release = json.load(handle)

assets = release.get('assets', [])
preferred = [asset for asset in assets if asset.get('name', '').startswith('manclaw-release-') and asset.get('name', '').endswith('.zip')]
fallback = [asset for asset in assets if asset.get('name', '').endswith('.zip')]
candidates = preferred or fallback
if not candidates:
    raise SystemExit('No zip asset found in the latest release.')

asset = candidates[0]
print(asset['browser_download_url'])
print(asset['name'])
PY
)

DOWNLOAD_URL="${RELEASE_INFO[0]:-}"
ASSET_NAME="${RELEASE_INFO[1]:-}"

if [[ -z "$DOWNLOAD_URL" || -z "$ASSET_NAME" ]]; then
  echo "Failed to resolve release asset." >&2
  exit 1
fi

echo "Downloading ${DOWNLOAD_URL}"
curl -fsSL "$DOWNLOAD_URL" -o "$ZIP_TMP"

mkdir -p "$TARGET_DIR"

readarray -t EXTRACT_INFO < <(
  python3 - "$ZIP_TMP" "$TARGET_DIR" <<'PY'
import os
import shutil
import sys
import zipfile

zip_path, target_dir = sys.argv[1], os.path.abspath(sys.argv[2])

with zipfile.ZipFile(zip_path) as archive:
    entries = archive.namelist()
    top_levels = {entry.split('/', 1)[0] for entry in entries if entry and not entry.startswith('__MACOSX/')}
    top_level = next(iter(top_levels)) if len(top_levels) == 1 else ''
    if top_level:
        destination = os.path.join(target_dir, top_level)
        if os.path.exists(destination):
            shutil.rmtree(destination)
    archive.extractall(target_dir)
    print(os.path.join(target_dir, top_level) if top_level else target_dir)
PY
)

RELEASE_DIR="${EXTRACT_INFO[0]:-}"
if [[ -z "$RELEASE_DIR" ]]; then
  echo "Failed to determine extracted release directory." >&2
  exit 1
fi

echo "Extracted to ${RELEASE_DIR}"

if [[ "$SKIP_INSTALL" != "1" ]]; then
  (cd "$RELEASE_DIR" && npm install --omit=dev)
  echo "Dependencies installed in ${RELEASE_DIR}"
fi
