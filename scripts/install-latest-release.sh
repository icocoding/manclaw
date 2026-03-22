#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REPO="icocoding/manclaw"
REPO="${MANCLAW_RELEASE_REPO:-$DEFAULT_REPO}"
TARGET_DIR="."
ACTION=""
SKIP_INSTALL="0"
REMOVE_FILES="0"
USING_DEFAULT_REPO="1"
ACTION_SPECIFIED="0"

if [[ $# -gt 0 && "${1:-}" != "" && "${1:0:1}" != "-" ]]; then
  case "$1" in
    install|uninstall)
      ACTION="$1"
      ACTION_SPECIFIED="1"
      shift
      ;;
    *)
      echo "Unknown action: $1" >&2
      exit 1
      ;;
  esac
fi

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
    --remove-files)
      REMOVE_FILES="1"
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage: install-latest-release.sh [install|uninstall] [--repo owner/name] [--target-dir DIR] [--skip-install] [--remove-files]

Download the latest ManClaw release zip from GitHub releases, extract it,
and install it as a global CLI by default. If no action is passed in an
interactive shell, the script will prompt you to choose install or uninstall.

Actions:
  install     Download and install the latest ManClaw release (default)
  uninstall   Uninstall the global ManClaw CLI; add --remove-files to also delete TARGET_DIR/manclaw-release

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

print_missing_command_help() {
  case "$1" in
    unzip)
      cat >&2 <<'EOF'
Missing required command: unzip

Install unzip and rerun the installer.

Examples:
  Ubuntu / Debian: sudo apt update && sudo apt install -y unzip
  CentOS / RHEL:   sudo yum install -y unzip
  Fedora:          sudo dnf install -y unzip
  Alpine:          sudo apk add unzip
  macOS:           brew install unzip
EOF
      ;;
    *)
      echo "Missing required command: $1" >&2
      ;;
  esac
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    print_missing_command_help "$1"
    exit 1
  fi
}

need_cmd curl
need_cmd unzip
need_cmd npm

log() {
  printf '[manclaw-install] %s\n' "$1"
}

choose_action() {
  local choice

  if [[ "$ACTION_SPECIFIED" == "1" ]]; then
    return 0
  fi

  if [[ ! -t 0 ]]; then
    ACTION="install"
    return 0
  fi

  cat <<'EOF'
Select action:
  1) Install ManClaw
  2) Uninstall ManClaw
EOF

  while true; do
    read -r -p "Choose [1/2] (default: 1): " choice
    case "${choice:-1}" in
      1)
        ACTION="install"
        return 0
        ;;
      2)
        ACTION="uninstall"
        return 0
        ;;
      *)
        echo "Invalid choice: ${choice}" >&2
        ;;
    esac
  done
}

uninstall_manclaw() {
  local release_dir
  TARGET_DIR_ABS="$(mkdir -p "$TARGET_DIR" && cd "$TARGET_DIR" && pwd -P)"
  release_dir="${TARGET_DIR_ABS}/manclaw-release"

  log "Uninstalling global ManClaw CLI"
  npm uninstall -g manclaw >/dev/null 2>&1 || true

  if [[ "$REMOVE_FILES" == "1" ]]; then
    if [[ -d "$release_dir" ]]; then
      log "Removing extracted release directory: ${release_dir}"
      rm -rf "${release_dir}"
    else
      log "No extracted release directory found at ${release_dir}"
    fi
  fi

  cat <<EOF

ManClaw uninstall completed.

Global CLI:
  removed (if previously installed)

Release files:
  $(if [[ "$REMOVE_FILES" == "1" ]]; then printf 'requested removal from %s/manclaw-release' "$TARGET_DIR_ABS"; else printf 'kept on disk (pass --remove-files to delete extracted files)'; fi)
EOF
}

choose_action

if [[ "$ACTION" == "uninstall" ]]; then
  uninstall_manclaw
  exit 0
fi

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
  log "Using default release repo: ${DEFAULT_REPO}"
  log "If you are installing from a fork, pass --repo owner/name or set MANCLAW_RELEASE_REPO."
fi

API_URL="https://api.github.com/repos/${REPO}/releases/latest"
RELEASE_JSON="$(mktemp)"
ZIP_TMP="$(mktemp)"
trap 'rm -f "$RELEASE_JSON" "$ZIP_TMP"' EXIT

log "Fetching latest release metadata from ${REPO}"

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

log "Downloading ${ASSET_NAME}"
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
    log "Replacing existing directory: ${TARGET_DIR_ABS}/${TOP_LEVEL}"
    rm -rf "${TARGET_DIR_ABS:?}/${TOP_LEVEL}"
  fi
fi

log "Extracting release into ${TARGET_DIR_ABS}"
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

log "Release extracted to ${RELEASE_DIR}"

if [[ "$SKIP_INSTALL" != "1" ]]; then
  log "Installing release dependencies in ${RELEASE_DIR}"
  npm install --omit=dev --prefix "$RELEASE_DIR"
  log "Installing ManClaw as a global CLI"
  npm install -g "$RELEASE_DIR"
  log "Global CLI installed from ${RELEASE_DIR}"
else
  log "Skipped global install"
fi

cat <<EOF

ManClaw is ready.

Install directory:
  ${RELEASE_DIR}

Control with global CLI:
  manclaw start
  manclaw status
  manclaw restart
  manclaw stop
  manclaw info
  manclaw check-update
  manclaw update
  manclaw uninstall

If you skipped global install:
  cd "${RELEASE_DIR}" && npm install --omit=dev && npm start

Global runtime home:
  ~/.manclaw-home
  override with MANCLAW_HOME=/path/to/home

Preview on another port:
  PORT=18301 manclaw start

Update later:
  curl -fsSL https://github.com/${DEFAULT_REPO}/releases/download/scripts/install-latest-release.sh | bash -s -- --target-dir "${TARGET_DIR_ABS}"

Uninstall later:
  curl -fsSL https://github.com/${DEFAULT_REPO}/releases/download/scripts/install-latest-release.sh | bash -s -- uninstall --target-dir "${TARGET_DIR_ABS}"
  curl -fsSL https://github.com/${DEFAULT_REPO}/releases/download/scripts/install-latest-release.sh | bash -s -- uninstall --target-dir "${TARGET_DIR_ABS}" --remove-files

Open:
  http://localhost:18300
EOF
