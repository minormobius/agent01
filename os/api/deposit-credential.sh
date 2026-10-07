#!/usr/bin/env bash
# First: bash os/api/deposit-credential.sh --login
# Then:  bash os/api/deposit-credential.sh
set -euo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
for runtime in python3 python; do
  if command -v "$runtime" >/dev/null 2>&1 && "$runtime" -c 'import sys; assert sys.version_info >= (3, 9)' >/dev/null 2>&1; then
    exec "$runtime" "$SCRIPT_DIR/deposit-credential.py" "$@"
  fi
done
echo 'error: Python 3.9+ required; you can also run deposit-credential.py directly' >&2
exit 1
