#!/usr/bin/env bash
# Build the signed macOS arm64 Desktop release artifacts from this checkout.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./build-macos.sh [--internal-dmg] <build-version>

By default, builds the signed macOS arm64 release artifacts: DMG, ZIP, ZIP blockmap,
and update feed YAML. Use --internal-dmg to build only an unsigned internal DMG.
The version must be confirmed before packaging. Configure apps/desktop/.env.macos
from its example first; release builds also require the signing and notarization
credentials documented for Desktop packaging.
EOF
}

if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  usage
  exit 0
fi
internal_dmg=0
if [[ $# -eq 2 && $1 == --internal-dmg ]]; then
  internal_dmg=1
  shift
fi
if [[ $# -ne 1 ]]; then
  usage >&2
  exit 2
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$script_dir"

if [[ $(uname -s) != Darwin || $(uname -m) != arm64 ]]; then
  printf '%s\n' 'build-macos.sh requires an Apple Silicon macOS host.' >&2
  exit 1
fi
for command in node pnpm; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'build-macos.sh requires %s on PATH.\n' "$command" >&2
    exit 1
  fi
done
node_architecture=$(node -p 'process.arch')
if [[ $node_architecture != arm64 ]]; then
  printf '%s\n' 'build-macos.sh requires an arm64 Node.js runtime.' >&2
  exit 1
fi
if [[ ! -f apps/desktop/.env.macos ]]; then
  printf '%s\n' 'Missing apps/desktop/.env.macos; copy apps/desktop/.env.macos.example and set DSH_DESKTOP_APP_ID.' >&2
  exit 1
fi

if [[ $internal_dmg -eq 1 ]]; then
  exec pnpm run package:desktop:mac:arm64:internal-dmg -- --build-version "$1"
fi
exec pnpm run package:desktop:mac:arm64 -- --build-version "$1"
