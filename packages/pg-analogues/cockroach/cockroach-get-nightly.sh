#!/usr/bin/env bash
set -e
# https://binaries.cockroachdb.com/cockroach-v21.1.6.darwin-10.9-amd64.tgz
# curl -LO https://edge-binaries.cockroachdb.com/cockroach/cockroach.linux-gnu-amd64.LATEST
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  VARIANT="linux-gnu-amd64"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  VARIANT="darwin-amd64"
else
  echo "Didn't recognize OSTYPE '$OSTYPE'" >&2
  exit 1
fi
curl -o cockroach.LATEST -L https://edge-binaries.cockroachdb.com/cockroach/cockroach.$VARIANT.LATEST
chmod +x cockroach.LATEST
./cockroach.LATEST version
