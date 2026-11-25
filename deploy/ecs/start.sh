#!/usr/bin/env bash
#
# ECS 上一键启动 / 更新容器
# 用法：
#   chmod +x start.sh
#   ./start.sh
#
# 说明：
#   - 若 .env 中提供了 ACR_REGISTRY/ACR_USERNAME/ACR_PASSWORD，则先登录 ACR（适合未配 RAM 免密拉取的情况）
#   - 若未提供 ACR 凭据，假定已通过 RAM 角色实现免密拉取
#   - 始终先 pull 最新 latest 再 up -d，因此首次启动和更新用同一个脚本
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/.env"

# 读取 .env（供 ACR 登录与 compose 变量注入使用）
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "⚠️  未找到 $ENV_FILE，请先创建（至少包含 ACR_REGISTRY / ACR_NAMESPACE / ACR_REPOSITORY）。"
fi

# 校验关键变量
: "${ACR_REGISTRY:?请在 .env 中设置 ACR_REGISTRY}"
: "${ACR_NAMESPACE:?请在 .env 中设置 ACR_NAMESPACE}"
: "${ACR_REPOSITORY:?请在 .env 中设置 ACR_REPOSITORY}"

# ACR 登录（仅在显式提供凭据时）
if [[ -n "${ACR_USERNAME:-}" && -n "${ACR_PASSWORD:-}" ]]; then
  echo ">> 登录 ACR: $ACR_REGISTRY"
  echo "$ACR_PASSWORD" | docker login "$ACR_REGISTRY" -u "$ACR_USERNAME" --password-stdin
else
  echo ">> 未提供 ACR 凭据，假定已通过 RAM 角色免密拉取"
fi

echo ">> 拉取最新镜像并启动"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo ">> 容器状态"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo ">> 等待健康检查 (5s)"
sleep 5
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T radio wget -qO- http://localhost:3000/api/health >/dev/null 2>&1; then
  echo "✅ 健康检查通过，服务已就绪（经反向代理 http://radio:3000 访问）"
else
  echo "❌ 健康检查未通过，请查看日志："
  echo "   docker compose -f \"$COMPOSE_FILE\" --env-file \"$ENV_FILE\" logs radio"
fi
