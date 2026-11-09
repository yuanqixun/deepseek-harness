#!/usr/bin/env bash
# Build macOS arm64 Desktop artifacts with the local enterprise plugin bundles.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./build-macos.sh [--internal-dmg] [--no-preinstall-private-plugins] [--config-env NAME] [build-version]

By default, builds the signed macOS arm64 release artifacts: DMG, ZIP, ZIP blockmap,
and update feed YAML. The local dsh-pro-auth and dsh-private-market bundles are
preinstalled by default. Use --internal-dmg to build only an unsigned internal DMG.
Use --no-preinstall-private-plugins to omit those bundles. Without market settings,
the private-market UI bundle is installed but its Host catalog service stays disabled.
Set DSH_CONFIG_ENV_DIR and DSH_CONFIG_ENV in apps/desktop/.env.macos to select the
private-market configuration. --config-env overrides the environment name for this run.
When run in a terminal, the script prompts for the configuration environment
and build version, then asks for confirmation. Enter to keep the shown default;
use '-' to clear the configuration environment. Confirmed values are stored in
the current user's config directory. Configure apps/desktop/.env.macos from its
example first; signed release builds also require the signing and notarization
credentials documented for Desktop packaging.
EOF
}

if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  usage
  exit 0
fi
internal_dmg=0
preinstall_private_plugins=1
config_environment=
build_version=
while [[ $# -gt 0 ]]; do
  case $1 in
    --internal-dmg) internal_dmg=1 ;;
    --no-preinstall-private-plugins) preinstall_private_plugins=0 ;;
    --config-env)
      if [[ $# -lt 2 || -z ${2:-} ]]; then
        usage >&2
        exit 2
      fi
      config_environment=$2
      shift 2
      continue
      ;;
    --*)
      usage >&2
      exit 2
      ;;
    *)
      if [[ -n $build_version ]]; then
        usage >&2
        exit 2
      fi
      build_version=$1
      ;;
  esac
  shift
done

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

if [[ -t 0 && -t 1 ]]; then
  preferences=$(node scripts/desktop-build-preferences.mjs read macos)
  if [[ -z $build_version ]]; then
    build_version=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).buildVersion)' "$preferences")
  fi
  if [[ -z $config_environment ]]; then
    config_environment=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).configEnvironment)' "$preferences")
  fi
  printf '配置环境名 [%s；回车沿用，输入 - 清除]: ' "${config_environment:-未选择}"
  IFS= read -r entered_environment
  if [[ -n $entered_environment ]]; then
    if [[ $entered_environment == - ]]; then
      config_environment=
    else
      config_environment=$entered_environment
    fi
  fi
  if [[ -n $config_environment && ! $config_environment =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    printf '%s\n' 'Configuration environment must match ^[a-z0-9][a-z0-9-]*$.' >&2
    exit 2
  fi
  printf 'Desktop 版本 [%s；回车沿用]: ' "${build_version:-请输入版本}"
  IFS= read -r entered_version
  if [[ -n $entered_version ]]; then
    build_version=$entered_version
  fi
  if [[ -z $build_version ]]; then
    printf '%s\n' 'A Desktop build version is required.' >&2
    exit 2
  fi
  printf '准备打包：配置环境=%s，版本=%s。确认开始？[y/N] ' "${config_environment:-未选择}" "$build_version"
  IFS= read -r confirmation
  if [[ ! $confirmation =~ ^([yY]|[yY][eE][sS])$ ]]; then
    printf '%s\n' 'Packaging cancelled.'
    exit 0
  fi
  node scripts/desktop-build-preferences.mjs write macos "$build_version" "$config_environment"
elif [[ -z $build_version ]]; then
  printf '%s\n' 'A build version is required when input is not interactive.' >&2
  usage >&2
  exit 2
fi
if [[ -n $config_environment && ! $config_environment =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  printf '%s\n' 'Configuration environment must match ^[a-z0-9][a-z0-9-]*$.' >&2
  exit 2
fi

if [[ $internal_dmg -eq 1 ]]; then
  package_script=package:desktop:mac:arm64:internal-dmg
else
  package_script=package:desktop:mac:arm64
fi
if [[ $preinstall_private_plugins -eq 1 ]]; then
  package_arguments=(--build-version "$build_version" --preinstall-private-plugins)
else
  package_arguments=(--build-version "$build_version")
fi
if [[ -n $config_environment ]]; then
  package_arguments+=(--config-env "$config_environment")
fi
exec pnpm run "$package_script" -- "${package_arguments[@]}"
