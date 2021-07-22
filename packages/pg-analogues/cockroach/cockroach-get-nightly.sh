#!/usr/bin/env bash
set -e
curl -LO https://edge-binaries.cockroachdb.com/cockroach/cockroach.linux-gnu-amd64.LATEST
chmod +x cockroach.linux-gnu-amd64.LATEST
./cockroach.linux-gnu-amd64.LATEST version
