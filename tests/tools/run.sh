#!/usr/bin/env bash
# 工具页测试总入口：单元套件 + 整页集成套件。
# 用法：bash tests/tools/run.sh <构建成品的 tools/index.html 路径>
# 依赖：先在 tests/tools 下执行 npm install（jsdom）；P0-1 矩阵另需 python3 + PyYAML。
set -u
cd "$(dirname "$0")"
ROOT="$(pwd)"
PAGE="${1:?用法: bash tests/tools/run.sh <built tools/index.html 路径>}"
case "$PAGE" in /*) ;; *) PAGE="$ROOT/../../$PAGE" ;; esac
FAILED=""

run() {
  local name="$1"; shift
  echo "===== $name ====="
  if "$@"; then echo "----- $name OK -----"; else echo "----- $name FAILED -----"; FAILED="$FAILED $name"; fi
}

for t in unit/batch-a/test-a.mjs unit/batch-b/test-b.mjs unit/batch-c/test-c.mjs unit/batch-d/test-d.mjs unit/batch-d/test-f1.mjs unit/batch-d/test-nginx.mjs; do
  run "$t" node "$ROOT/$t"
done
for t in integration/smoke-full.mjs integration/smoke-bc.mjs integration/smoke-d.mjs integration/explain-check.mjs integration/test-p0-1.mjs; do
  run "$t" node "$ROOT/$t" "$PAGE"
done

if [ -n "$FAILED" ]; then
  echo "FAILED SUITES:$FAILED"
  exit 1
fi
echo "ALL TOOL TEST SUITES PASSED"
