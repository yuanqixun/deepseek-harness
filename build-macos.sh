#!/usr/bin/env bash
# Build macOS arm64 Desktop artifacts with the local enterprise plugin bundles.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./build-macos.sh [--internal-dmg] [--no-preinstall-private-plugins] [--config-env NAME] <build-version>

By default, builds the signed macOS arm64 release artifacts: DMG, ZIP, ZIP blockmap,
and update feed YAML. The local dsh-pro-auth and dsh-private-market bundles are
preinstalled by default. Use --internal-dmg to build only an unsigned internal DMG.
Use --no-preinstall-private-plugins to omit those bundles. Without market settings,
the private-market UI bundle is installed but its Host catalog service stays disabled.
Set DSH_CONFIG_ENV_DIR and DSH_CONFIG_ENV in apps/desktop/.env.macos to select the
private-market configuration. --config-env overrides the environment name for this run.
The version must be confirmed before packaging. Configure apps/desktop/.env.macos
from its example first; signed release builds also require the signing and
notarization credentials documented for Desktop packaging.
EOF
}

if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  usage
  exit 0
fi
internal_dmg=0
preinstall_private_plugins=1
config_environment=
while [[ $# -gt 1 ]]; do
  case $1 in
    --internal-dmg) internal_dmg=1 ;;
    --no-preinstall-private-plugins) preinstall_private_plugins=0 ;;
    --config-env)
      if [[ $# -lt 3 || -z ${2:-} ]]; then
        usage >&2
        exit 2
      fi
      config_environment=$2
      shift 2
      continue
      ;;
    *) break ;;
  esac
  shift
done
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
  package_script=package:desktop:mac:arm64:internal-dmg
else
  package_script=package:desktop:mac:arm64
fi
if [[ $preinstall_private_plugins -eq 1 ]]; then
  package_arguments=(--build-version "$1" --preinstall-private-plugins)
else
  package_arguments=(--build-version "$1")
fi
if [[ -n $config_environment ]]; then
  package_arguments+=(--config-env "$config_environment")
fi
exec pnpm run "$package_script" -- "${package_arguments[@]}"
