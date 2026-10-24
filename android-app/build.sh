#!/usr/bin/env bash
# 一键构建（第一阶段验收口径）：组装 Debug + 全部 JVM 单元测试 + Lint。
set -euo pipefail
cd "$(dirname "$0")"
source "$HOME/workspace/devtools/env.sh"
export GRADLE_USER_HOME="$HOME/workspace/devtools/gradle-home"
export JAVA_TOOL_OPTIONS='-Djava.net.preferIPv4Stack=true'
# 本机构建基础设施自愈：Maven 镜像/中继若不在监听则拉起（VM 重启后会丢）
if ! (exec 3<>/dev/tcp/127.0.0.1/18081) 2>/dev/null; then
  (cd "$HOME/workspace/devtools" && setsid nohup ./run-mirror.sh > mirror-loop.out 2>&1 &)
  sleep 3
fi
if ! (exec 3<>/dev/tcp/127.0.0.1/18080) 2>/dev/null; then
  (cd "$HOME/workspace/devtools" && setsid nohup ./run-relay.sh > relay-loop.out 2>&1 &)
  sleep 2
fi
if [ ! -x ./gradlew ]; then
  gradle -q wrapper --gradle-version 8.14.3 --distribution-type bin --offline
fi
./gradlew --no-daemon assembleDebug testDebugUnitTest lintDebug --console=plain "$@"
echo "BUILD+TEST+LINT OK"
ls -la app/build/outputs/apk/debug/app-debug.apk
