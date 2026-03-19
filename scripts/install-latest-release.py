#!/usr/bin/env python3
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

DEFAULT_REPO = "icocoding/manclaw"


def detect_repo_slug() -> str | None:
    env_value = os.environ.get("MANCLAW_RELEASE_REPO", "").strip()
    if env_value:
        return env_value

    try:
        remote = subprocess.check_output(
            ["git", "config", "--get", "remote.origin.url"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except Exception:
        return None

    if remote.startswith("git@github.com:"):
        remote = remote[len("git@github.com:") :]
    elif remote.startswith("https://github.com/"):
        remote = remote[len("https://github.com/") :]
    else:
        return None

    if remote.endswith(".git"):
        remote = remote[:-4]

    return remote or None


def fetch_latest_release(repo_slug: str) -> dict:
    url = f"https://api.github.com/repos/{repo_slug}/releases/latest"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "manclaw-release-installer",
        },
    )
    with urllib.request.urlopen(request) as response:
        return json.load(response)


def select_zip_asset(release: dict) -> dict:
    assets = release.get("assets", [])
    preferred = [
        asset for asset in assets if asset.get("name", "").startswith("manclaw-release-") and asset.get("name", "").endswith(".zip")
    ]
    fallback = [asset for asset in assets if asset.get("name", "").endswith(".zip")]
    candidates = preferred or fallback
    if not candidates:
        raise RuntimeError("No zip asset found in the latest release.")
    return candidates[0]


def common_top_level(entries: list[str]) -> str | None:
    top_levels = {entry.split("/", 1)[0] for entry in entries if entry and not entry.startswith("__MACOSX/")}
    if len(top_levels) == 1:
        return next(iter(top_levels))
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Download and install the latest ManClaw release zip from GitHub releases.")
    parser.add_argument("--repo", help="GitHub repo slug, e.g. owner/name")
    parser.add_argument("--target-dir", default=".", help="Directory to extract the release into")
    parser.add_argument("--skip-install", action="store_true", help="Skip npm install after extraction")
    args = parser.parse_args()

    repo_slug = args.repo or detect_repo_slug() or DEFAULT_REPO
    using_default_repo = not args.repo and not os.environ.get("MANCLAW_RELEASE_REPO") and repo_slug == DEFAULT_REPO

    if using_default_repo:
        print(f"Using default release repo: {DEFAULT_REPO}", file=sys.stderr)
        print("If you are installing from a fork, pass --repo owner/name or set MANCLAW_RELEASE_REPO.", file=sys.stderr)

    release = fetch_latest_release(repo_slug)
    asset = select_zip_asset(release)
    download_url = asset["browser_download_url"]
    asset_name = asset["name"]

    target_root = Path(args.target_dir).resolve()
    target_root.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="manclaw-release-") as temp_dir:
        zip_file = Path(temp_dir) / asset_name
        print(f"Downloading {download_url}")
        urllib.request.urlretrieve(download_url, zip_file)

        with zipfile.ZipFile(zip_file) as archive:
            top_level = common_top_level(archive.namelist())
            if top_level:
                destination = target_root / top_level
                if destination.exists():
                    shutil.rmtree(destination)
            archive.extractall(target_root)

        release_dir = (target_root / top_level) if top_level else target_root
        print(f"Extracted to {release_dir}")

        if not args.skip_install:
            subprocess.run(["npm", "install", "--omit=dev"], cwd=release_dir, check=True)
            print(f"Dependencies installed in {release_dir}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
