/**
 * 共享的视频筛选逻辑（与 VideoList、后端 _apply_filters 一致）
 * 产品介绍 = 标题/关键词匹配产品关键词；非产品 = 全量-产品-其他；其他 = Category===其他
 */
const PRODUCT_KEYWORDS = ['AIPCon', 'Foundrycon', 'Paragon', 'Pipeline', 'AIP', 'Foundry', 'Gotham', 'Apollo', 'Demo', 'Tutorial', 'Workshop', 'Case Study', 'Bootcamp', 'How to', 'Guide'];

export function applyVideoFilters(videos, filters, configKeywords = null) {
  const keywords = configKeywords && Object.keys(configKeywords).length > 0
    ? Object.keys(configKeywords)
    : PRODUCT_KEYWORDS;
  let list = [...videos];

  if (filters.search) {
    const q = filters.search.toLowerCase();
    const inKw = filters.searchInKeywords;
    list = list.filter((v) => {
      const matchTitle = (v.Title || '').toLowerCase().includes(q);
      if (matchTitle) return true;
      if (inKw && (v.Keywords || '')) return (v.Keywords || '').toLowerCase().includes(q);
      return matchTitle;
    });
  }
  if (filters.rankFilter) list = list.filter((v) => v.Rank === filters.rankFilter);
  if (filters.rankFilterMulti) {
    const rfm = filters.rankFilterMulti;
    if (rfm === 'S+') list = list.filter((v) => v.Rank === 'S');
    else if (rfm === 'A+') list = list.filter((v) => ['S', 'A'].includes(v.Rank));
    else if (rfm === 'B+') list = list.filter((v) => ['S', 'A', 'B'].includes(v.Rank));
  }
  if (filters.transcriptFilter === '有') list = list.filter((v) => v.Transcript === '有');
  else if (filters.transcriptFilter === '无') list = list.filter((v) => v.Transcript === '无');
  else if (filters.transcriptFilter === 'whisper') list = list.filter((v) => v.Transcript === '有' && (v.TranscriptSource || '').toLowerCase() === 'whisper');
  else if (filters.transcriptFilter === 'youtube') list = list.filter((v) => v.Transcript === '有' && (v.TranscriptSource || '').toLowerCase() !== 'whisper');

  if (filters.categoryFilter) {
    if (filters.categoryFilter === '产品介绍') {
      list = list.filter((v) => {
        const text = ((v.Title || '') + ' ' + (v.Keywords || '')).toLowerCase();
        return keywords.some((kw) => text.includes(kw.toLowerCase()));
      });
    } else if (filters.categoryFilter === '其他') {
      list = list.filter((v) => (v.Category || v.category || '') === '其他');
    } else if (filters.categoryFilter === '非产品介绍') {
      const isProduct = (v) => {
        const text = ((v.Title || '') + ' ' + (v.Keywords || '')).toLowerCase();
        return keywords.some((kw) => text.includes(kw.toLowerCase()));
      };
      list = list.filter((v) => !isProduct(v) && (v.Category || v.category || '') !== '其他');
    }
  }

  if (filters.dateFrom) list = list.filter((v) => (v.Date || '').slice(0, 7) >= (filters.dateFrom || '').slice(0, 7));
  if (filters.dateTo) list = list.filter((v) => (v.Date || '').slice(0, 7) <= (filters.dateTo || '').slice(0, 7));
  if (filters.viewsMin && Number(filters.viewsMin) > 0) list = list.filter((v) => Number(v.Views || 0) >= Number(filters.viewsMin));
  if (filters.viewsMax && Number(filters.viewsMax) > 0) list = list.filter((v) => Number(v.Views || 0) <= Number(filters.viewsMax));

  return list;
}
