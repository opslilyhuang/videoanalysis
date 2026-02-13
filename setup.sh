#!/bin/bash

# Palantir Video Analysis - Setup Script

echo "=========================================="
echo "🚀 Palantir 视频分析系统 - 环境配置"
echo "=========================================="
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到 Python 3"
    echo "请先安装 Python 3.8 或更高版本"
    exit 1
fi

echo "✅ Python 已安装: $(python3 --version)"
echo ""

# 创建虚拟环境
echo "📦 创建虚拟环境..."
python3 -m venv venv

# 激活虚拟环境
echo "🔌 激活虚拟环境..."
source venv/bin/activate

# 升级 pip
echo "⬆️  升级 pip..."
pip install --upgrade pip > /dev/null

# 安装依赖
echo "📥 安装依赖包..."
pip install -r requirements.txt

echo ""
echo "=========================================="
echo "✅ 环境配置完成！"
echo "=========================================="
echo ""
echo "使用方法:"
echo ""
echo "1. 测试运行（处理 5 个视频）:"
echo "   python test_run.py"
echo ""
echo "2. 完整分析（处理所有视频）:"
echo "   python palantir_analyzer.py"
echo ""
echo "3. 退出虚拟环境:"
echo "   deactivate"
echo ""
