#!/usr/bin/env bash
# Rebuilds the vendored cheqd/agent-toolkit tarballs in vendor/agent-toolkit/ from a PINNED commit.
#
# The toolkit's packages are private and unpublished (version 0.0.0), so Studio consumes them as `npm pack`
# tarballs, the same way it consumes the Credo fork from vendor/credo/. The toolkit checkout is only READ:
# the sources are exported with `git archive` into a temporary directory, built and packed there. Nothing is
# edited, committed, tagged or published in the toolkit repository.
#
# The only change to the exported copy is its package versions: `0.0.0` becomes `0.0.0-<sha>` (and the
# `@cheqd/agent-identity` dependency of the AP2 package follows), so the commit is visible in the tarball name.
#
# Usage: scripts/vendor-agent-toolkit.sh <path-to-agent-toolkit-checkout> <commit>
# Example: scripts/vendor-agent-toolkit.sh ../agent-toolkit a831d48
set -euo pipefail

TOOLKIT_REPO="${1:?path to the agent-toolkit checkout}"
COMMIT="${2:?commit to pin}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/vendor/agent-toolkit"
# core is required by ap2. The A2A gate package is deliberately not vendored: Studio uses @a2a-js/sdk directly
# (card signing and verification) and the gate pulls in gRPC and protobuf optional peers it does not need.
PACKAGES=(core ap2)

SHA="$(git -C "$TOOLKIT_REPO" rev-parse --short=7 "$COMMIT")"
VERSION="0.0.0-${SHA}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git -C "$TOOLKIT_REPO" archive "$COMMIT" | tar -x -C "$WORK"
cd "$WORK"
npm ci --ignore-scripts --no-audit --no-fund >/dev/null

for pkg in "${PACKAGES[@]}"; do
	node -e '
		const fs = require("fs");
		const file = process.argv[1];
		const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
		manifest.version = process.argv[2];
		manifest.cheqdToolkitCommit = process.argv[3];
		if (manifest.dependencies && manifest.dependencies["@cheqd/agent-identity"]) {
			manifest.dependencies["@cheqd/agent-identity"] = process.argv[2];
		}
		fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
	' "packages/${pkg}/package.json" "$VERSION" "$COMMIT"
done

npx tsc --build

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/cheqd-agent-identity*.tgz
for pkg in "${PACKAGES[@]}"; do
	(cd "packages/${pkg}" && npm pack --pack-destination "$OUT_DIR" --silent)
done
ls -l "$OUT_DIR"
