#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILE="$ROOT/src/baseline/chatgpt_chat_size_meter_v222_sse_outcome_post_correlation.js"
EXPECTED="08bf10714deae924ced7716b5b63f873ba56b11d782289b92d55de62af343696"
ACTUAL="$(sha256sum "$FILE" | awk '{print $1}')"
if [[ "$ACTUAL" != "$EXPECTED" ]]; then
  echo "FAIL: V2.22 baseline hash mismatch"
  echo "expected: $EXPECTED"
  echo "actual:   $ACTUAL"
  exit 1
fi
echo "PASS: V2.22 baseline SHA-256 matches: $ACTUAL"
node --check "$FILE"
echo "PASS: node --check"