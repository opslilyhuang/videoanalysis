"""
Quick Test Script
Test the analyzer with a small sample of videos first
"""

from palantir_analyzer import PalantirVideoAnalyzer

def main():
    print("\n🧪 测试模式：只处理前 20 个视频\n")

    # Palantir 官方 YouTube 频道
    PALANTIR_CHANNEL_URL = "https://www.youtube.com/@palantirtech"

    # 创建分析器
    analyzer = PalantirVideoAnalyzer(output_dir="palantir_test")

    # 运行测试 - 只处理前20个视频
    analyzer.analyze_channel(PALANTIR_CHANNEL_URL, limit=20)

    print("\n✅ 测试完成！")
    print("📁 查看结果: palantir_test/")
    print("\n如果测试成功，可以运行完整分析:")
    print("  python palantir_analyzer.py\n")


if __name__ == "__main__":
    main()
