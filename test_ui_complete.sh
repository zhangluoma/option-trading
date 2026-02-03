#!/bin/bash

echo "🧪 UI完整功能测试"
echo "=================================="
echo ""

# 测试1: 主页加载
echo "1️⃣ 测试主页加载..."
if curl -s "http://localhost:3456/" | grep -q "current-block"; then
  echo "   ✅ 主页加载成功，包含区块显示"
else
  echo "   ❌ 主页加载失败"
fi

# 测试2: API endpoints
echo ""
echo "2️⃣ 测试API端点..."

apis=(
  "/api/balance"
  "/api/positions"
  "/api/fills"
  "/api/trades"
  "/api/networth-history"
  "/api/scanner-status"
)

for api in "${apis[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3456$api")
  if [ "$status" = "200" ]; then
    echo "   ✅ $api"
  else
    echo "   ❌ $api (HTTP $status)"
  fi
done

# 测试3: 区块数据
echo ""
echo "3️⃣ 测试区块数据..."
block=$(curl -s "http://localhost:3456/api/scanner-status" | grep -o '"last_processed_height":[0-9]*' | grep -o '[0-9]*')
if [ -n "$block" ] && [ "$block" -gt 0 ]; then
  echo "   ✅ 当前区块: $(printf "%'d" $block)"
else
  echo "   ❌ 无法获取区块数据"
fi

# 测试4: 净值历史
echo ""
echo "4️⃣ 测试净值历史..."
count=$(curl -s "http://localhost:3456/api/networth-history?hours=24" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
if [ -n "$count" ] && [ "$count" -gt 0 ]; then
  echo "   ✅ 净值记录: $count 条"
else
  echo "   ⚠️  净值记录: 0 条"
fi

echo ""
echo "=================================="
echo "✅ 测试完成"
echo ""
echo "访问 UI: http://localhost:3456"
echo "测试页面: http://localhost:3456/test_block_display.html"
