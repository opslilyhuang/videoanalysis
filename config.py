# Configuration

# YouTube Channel
PALANTIR_CHANNEL_URL = "https://www.youtube.com/@palantirtech"

# Analysis Settings
VIDEO_LIMIT = None  # None = all videos, or set to integer for testing (e.g., 10)

# Output
OUTPUT_DIR = "palantir_analysis"

# Scoring Weights (must sum to 1.0)
VIEW_WEIGHT = 0.4
TIME_WEIGHT = 0.3
KEYWORD_WEIGHT = 0.3

# View Score Thresholds (view_count)
VIEW_TIER_1 = 100000  # >= 100K: 100 points
VIEW_TIER_2 = 50000   # >= 50K: 80 points
VIEW_TIER_3 = 20000   # >= 20K: 60 points

# Rank Thresholds
RANK_S_THRESHOLD = 85  # Score >= 85: S rank
RANK_A_THRESHOLD = 70  # Score >= 70: A rank

# Keywords
CORE_KEYWORDS = [
    'AIPCon', 'Foundrycon', 'Paragon', 'Pipeline',
    'AIP', 'Foundry', 'Gotham', 'Apollo'
]

SECONDARY_KEYWORDS = [
    'Demo', 'Tutorial', 'Workshop', 'Case Study',
    'Bootcamp', 'How to', 'Guide'
]

# Transcript Languages (priority order)
TRANSCRIPT_LANGUAGES = ['zh-Hans', 'zh', 'en', 'en-US', 'en-GB']
