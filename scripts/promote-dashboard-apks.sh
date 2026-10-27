#!/usr/bin/env bash
set -euo pipefail

# Validate the complete staged release before changing any public download.
test "$#" -eq 3
staging="$(realpath -e -- "$1")"
downloads="$(realpath -e -- "$2")"
sha="$3"
[[ "$sha" =~ ^[0-9a-f]{7}$ ]]
[[ "$staging" == "$downloads/.staging/"* ]]
test -w "$downloads"
cd "$staging"
shopt -s nullglob
apks=(*.apk)
test "${#apks[@]}" -eq 2
test -f SHA256SUMS
sha256sum --check --strict SHA256SUMS

for manifest in analitika-latest.json analitika-worker-latest.json; do
  test -f "$manifest"
  test ! -L "$manifest"
  grep -Fq "\"buildSha\": \"$sha\"" "$manifest"
done
for prefix in analitika-tablet analitika-fob; do
  matches=("$prefix"-v*-"$sha".apk)
  test "${#matches[@]}" -eq 1
  test -s "${matches[0]}"
  test ! -L "${matches[0]}"
done

# Keep previous versioned APKs usable. Publish new binaries first, then replace
# each manifest with a rename on the same filesystem, so no partial JSON is served.
for apk in "${apks[@]}"; do
  mv -- "$apk" "$downloads/$apk"
done
for manifest in analitika-latest.json analitika-worker-latest.json; do
  mv -- "$manifest" "$downloads/$manifest"
done
rm -- SHA256SUMS
cd "$downloads"
rmdir -- "$staging"
echo "Published both APKs for $sha"
