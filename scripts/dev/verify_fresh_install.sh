#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
verify_root="$(mktemp -d "${TMPDIR:-/tmp}/sovereign-fresh-install.XXXXXX")"
export npm_config_cache="$verify_root/.npm-cache"
cleanup() {
  case "$verify_root" in
    "${TMPDIR:-/tmp}"/sovereign-fresh-install.*) rm -rf -- "$verify_root" ;;
    *) printf '%s\n' "Refusing to remove unexpected verification path: $verify_root" >&2 ;;
  esac
}
trap cleanup EXIT

printf '%s\n' "[fresh-install] copying tracked and non-ignored source into $verify_root"
(
  cd "$repo_root"
  git ls-files --cached --others --exclude-standard -z \
    | tar --null -T - -cf -
) | tar -xf - -C "$verify_root"
(
  cd "$repo_root"
  git ls-files --cached --others --exclude-standard
) > "$verify_root/.sovereign-source-files"

printf '%s\n' "[fresh-install] initialize isolated source-control metadata"
git -C "$verify_root" init -q
git -C "$verify_root" add -A
git -C "$verify_root" \
  -c user.name='Sovereign Fresh Install' \
  -c user.email='fresh-install@localhost.invalid' \
  commit -qm 'fresh-install source snapshot'

package_roots=(
  "."
  "backend/api"
  "backend/gateway"
  "backend/mcp_server"
  "Frontend/dashboard"
)

for package_root in "${package_roots[@]}"; do
  if [[ ! -f "$verify_root/$package_root/package-lock.json" ]]; then
    printf '%s\n' "[fresh-install] missing lockfile: $package_root/package-lock.json" >&2
    exit 1
  fi
  printf '%s\n' "[fresh-install] npm ci: $package_root"
  npm --prefix "$verify_root/$package_root" ci --no-audit --no-fund
  npm --prefix "$verify_root/$package_root" ls --depth=0
done

printf '%s\n' "[fresh-install] build MCP and dashboard"
npm --prefix "$verify_root/backend/mcp_server" run build
npm --prefix "$verify_root/Frontend/dashboard" run build

printf '%s\n' "[fresh-install] build and test native core"
npm --prefix "$verify_root" run test:core

printf '%s\n' "[fresh-install] run security, contracts, structure, and aggregate tests"
npm --prefix "$verify_root" run check:env
npm --prefix "$verify_root" run test:secrets
npm --prefix "$verify_root" run test:api
npm --prefix "$verify_root" run test:contracts
npm --prefix "$verify_root" run test:structure
npm --prefix "$verify_root" test

printf '%s\n' "[fresh-install] PASS"
