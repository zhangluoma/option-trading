#!/bin/bash

# Interactive Brokers 安装和配置脚本
# 用途：检测安装、提供下载链接、配置 API

set -e

echo "=================================================="
echo "Interactive Brokers 安装助手"
echo "=================================================="
echo ""

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否已安装
check_installation() {
    echo "🔍 检查 IB Gateway/TWS 是否已安装..."
    echo ""
    
    # 检查常见安装位置
    if [ -d "/Applications/Trader Workstation.app" ]; then
        echo -e "${GREEN}✅ 发现 TWS：${NC}/Applications/Trader Workstation.app"
        return 0
    fi
    
    if [ -d "/Applications/IB Gateway.app" ]; then
        echo -e "${GREEN}✅ 发现 IB Gateway：${NC}/Applications/IB Gateway.app"
        return 0
    fi
    
    if [ -d "$HOME/Jts" ]; then
        echo -e "${GREEN}✅ 发现 IB 安装目录：${NC}$HOME/Jts"
        return 0
    fi
    
    echo -e "${RED}❌ 未找到 IB Gateway 或 TWS${NC}"
    return 1
}

# 提供下载指南
show_download_guide() {
    echo ""
    echo "📥 下载 Interactive Brokers Gateway"
    echo "=================================================="
    echo ""
    echo "选项 1：IB Gateway（推荐用于自动化）"
    echo "  • 轻量级，只有 API"
    echo "  • 无图形界面"
    echo "  • 稳定可靠"
    echo ""
    echo -e "${YELLOW}下载链接：${NC}"
    echo "  https://www.interactivebrokers.com/en/trading/ibgateway-stable.php"
    echo ""
    echo "选项 2：Trader Workstation（适合新手）"
    echo "  • 完整交易平台"
    echo "  • 图表和分析工具"
    echo "  • 更直观"
    echo ""
    echo -e "${YELLOW}下载链接：${NC}"
    echo "  https://www.interactivebrokers.com/en/trading/tws.php"
    echo ""
    echo "=================================================="
    echo ""
    echo -e "${YELLOW}安装步骤：${NC}"
    echo "  1. 点击上面的链接"
    echo "  2. 选择 'Latest' 版本"
    echo "  3. 下载 macOS 版本"
    echo "  4. 打开 .dmg 文件"
    echo "  5. 拖拽到 Applications"
    echo "  6. 运行并登录（选择 Paper Trading）"
    echo ""
    read -p "安装完成后按 Enter 继续..."
}

# 配置 API
configure_api() {
    echo ""
    echo "🔧 配置 API 连接"
    echo "=================================================="
    echo ""
    echo -e "${YELLOW}重要：必须手动启用 API${NC}"
    echo ""
    echo "在 TWS/Gateway 中："
    echo "  1. 打开菜单：File → Global Configuration"
    echo "  2. 点击：API → Settings"
    echo "  3. 勾选：☑ Enable ActiveX and Socket Clients"
    echo "  4. 勾选：☑ Allow connections from localhost only"
    echo "  5. 端口设置："
    echo "     • Paper Trading: 7497"
    echo "     • Live Trading: 7496"
    echo "  6. 点击 OK"
    echo "  7. 重启 TWS/Gateway"
    echo ""
    echo -e "${YELLOW}安全提示：${NC}"
    echo "  • 只允许 localhost 连接"
    echo "  • 不要共享端口"
    echo "  • 定期检查连接日志"
    echo ""
}

# 测试连接
test_connection() {
    echo ""
    echo "🧪 测试连接"
    echo "=================================================="
    echo ""
    
    # 检查端口是否开放
    if nc -z 127.0.0.1 7497 2>/dev/null; then
        echo -e "${GREEN}✅ 检测到 API 端口 7497（Paper Trading）${NC}"
        PORT_AVAILABLE=true
    elif nc -z 127.0.0.1 7496 2>/dev/null; then
        echo -e "${GREEN}✅ 检测到 API 端口 7496（Live Trading）${NC}"
        PORT_AVAILABLE=true
    else
        echo -e "${RED}❌ API 端口未开放${NC}"
        echo ""
        echo "可能原因："
        echo "  1. TWS/Gateway 未运行"
        echo "  2. API 未启用"
        echo "  3. 端口配置错误"
        PORT_AVAILABLE=false
    fi
    
    echo ""
    
    if [ "$PORT_AVAILABLE" = true ]; then
        echo "运行 Python 测试..."
        cd "$(dirname "$0")/.." || exit
        
        if python3 trading/ibkr_trader.py; then
            echo ""
            echo -e "${GREEN}✅ 连接测试成功！${NC}"
            return 0
        else
            echo ""
            echo -e "${RED}❌ 连接测试失败${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}跳过连接测试（端口未开放）${NC}"
        return 1
    fi
}

# 生成配置文件
generate_config() {
    echo ""
    echo "📝 生成配置文件"
    echo "=================================================="
    
    CONFIG_FILE="$(dirname "$0")/../config/credentials.yaml"
    
    if [ -f "$CONFIG_FILE" ]; then
        echo ""
        echo -e "${YELLOW}配置文件已存在：${NC}$CONFIG_FILE"
        read -p "是否覆盖？(y/N) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "跳过配置文件生成"
            return
        fi
    fi
    
    # 询问用户配置
    echo ""
    read -p "使用 Paper Trading？(Y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        MODE="live"
        PORT="7496"
    else
        MODE="paper"
        PORT="7497"
    fi
    
    read -p "API 端口 (默认 $PORT): " USER_PORT
    PORT=${USER_PORT:-$PORT}
    
    # 写入配置
    cat > "$CONFIG_FILE" << EOF
# Interactive Brokers Configuration
# Generated by setup_ibkr.sh

ibkr:
  mode: $MODE  # paper 或 live
  host: "127.0.0.1"
  port: $PORT
  client_id: 1
  
  # 账户（自动检测）
  account_id: ""
  
  # 交易配置
  exchange: "SMART"
  currency: "USD"

# dYdX configuration (optional)
dydx:
  mode: paper
  network: testnet
  private_key: ""

# Risk management
risk:
  max_open_positions: 4
  max_risk_per_trade: 500
  max_total_exposure: 0.50

# Notifications
notifications:
  whatsapp:
    enabled: true
EOF
    
    echo -e "${GREEN}✅ 配置文件已生成：${NC}$CONFIG_FILE"
}

# 主流程
main() {
    if check_installation; then
        echo ""
        configure_api
        test_connection
        
        if [ $? -eq 0 ]; then
            echo ""
            echo -e "${GREEN}🎉 设置完成！${NC}"
            echo ""
            echo "下一步："
            echo "  1. 运行交易系统：python3 main_trading_demo.py"
            echo "  2. 查看文档：cat IBKR_SETUP.md"
        else
            echo ""
            echo -e "${YELLOW}⚠️  连接测试失败，但安装已完成${NC}"
            echo ""
            echo "请检查："
            echo "  1. TWS/Gateway 是否正在运行"
            echo "  2. API 是否已启用"
            echo "  3. 端口配置是否正确"
        fi
    else
        show_download_guide
        
        # 下载后重新检查
        if check_installation; then
            configure_api
            test_connection
        else
            echo ""
            echo -e "${RED}未检测到安装${NC}"
            echo ""
            echo "请手动安装后重新运行此脚本"
        fi
    fi
    
    # 询问是否生成配置
    echo ""
    read -p "是否生成配置文件？(Y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        generate_config
    fi
}

# 运行
main
