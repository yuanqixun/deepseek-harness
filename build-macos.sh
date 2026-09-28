#!/usr/bin/env bash
# Build an unsigned internal macOS arm64 Desktop disk image from this checkout.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./build-macos.sh <build-version>

Builds an unsigned macOS arm64 DMG for internal distribution. The version must
be confirmed before packaging. Configure apps/desktop/.env.macos from its example first.
EOF
}

if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  usage
  exit 0
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

exec pnpm run package:desktop:mac:arm64:internal-dmg -- --build-version "$1"
