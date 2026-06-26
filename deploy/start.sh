#!/bin/sh
set -e
cd "$(dirname "$0")/.."
exec pm2-runtime deploy/ecosystem.config.cjs
