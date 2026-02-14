import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api';

const parseCSV = (text) => {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < lines[i].length; j++) {
      const c = lines[i][j];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (inQuotes) {
        current += c;
      } else if (c === ',') {
        values.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    values.push(current.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }
  return rows;
};

export function useData(baseUrl = '') {
  const [dashboards, setDashboards] = useState([
    { id: 'palantirtech', name: 'Palantir', isTemp: false },
    { id: 'temp', name: '临时上传', isTemp: true },
  ]);
  const [channelId, setChannelId] = useState('palantirtech');  // 即 dashboardId
  const [videosChannelId, setVideosChannelId] = useState(null);  // 当前 videos 所属看板，避免切到临时上传时短暂显示其他看板列表
  const [videos, setVideos] = useState([]);
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [filterSummary, setFilterSummary] = useState(null);
  const [failedVideos, setFailedVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runAnalysisLoading, setRunAnalysisLoading] = useState(false);
  const [error, setError] = useState(null);
  const [appConfig, setAppConfig] = useState({ autoWhisperConvert: false });

  const dataUrl = (path) => `${baseUrl}/data/${path}`;
  const apiUrl = (path) => (baseUrl ? `${baseUrl}/api${path}` : `/api${path}`);

  const fetchDashboards = useCallback(async () => {
    try {
      const res = await apiFetch('/api/dashboards');
      if (res.ok) {
        const data = await res.json();
        setDashboards(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setDashboards([
        { id: 'palantirtech', name: 'Palantir', isTemp: false },
        { id: 'temp', name: '临时上传', isTemp: true },
      ]);
    }
  }, [baseUrl]);

  const fetchVideos = useCallback(async (id) => {
    try {
      const csvRes = await fetch(dataUrl(`${id}/master_index.csv?t=${Date.now()}`), { cache: 'no-store' });
      if (!csvRes.ok) {
        setVideos([]);
        setVideosChannelId(id);
        return;
      }
      const text = await csvRes.text();
      const rows = parseCSV(text);
      let meta = {};
      try {
        const metaRes = await apiFetch(`/api/video-meta?dashboard_id=${id}`);
        if (metaRes.ok) meta = await metaRes.json();
      } catch {}
      const getVid = (url) => (url || '').match(/[?&]v=([a-zA-Z0-9_-]{11})/)?.[1] || '';
      setVideos(rows.map((r, i) => {
        const vid = getVid(r.URL);
        const m = meta[vid] || {};
        return {
          ...r,
          Keywords: r.Keywords || (Array.isArray(m.keywords) ? m.keywords.join(', ') : (m.keywords || '')),
          Category: r.Category || r.category || m.category || '',
          _id: i,
        };
      }));
      setVideosChannelId(id);
      setError(null);
    } catch (e) {
      setVideos([]);
      setVideosChannelId(id);
      setError(e.message);
    }
  }, [baseUrl]);

  const fetchConfig = useCallback(async (id) => {
    try {
      const res = await fetch(dataUrl(`${id}/config.json?t=${Date.now()}`), { cache: 'no-store' });
      if (!res.ok) return setConfig(null);
      const data = await res.json();
      setConfig(data);
    } catch {
      setConfig(null);
    }
  }, [baseUrl]);

  const fetchStatus = useCallback(async (id) => {
    try {
      const res = await fetch(dataUrl(`${id}/status.json?t=${Date.now()}`), { cache: 'no-store' });
      if (!res.ok) return setStatus(null);
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, [baseUrl]);

  const fetchFilterSummary = useCallback(async (id) => {
    try {
      const res = await fetch(dataUrl(`${id}/filter_summary.json?t=${Date.now()}`), { cache: 'no-store' });
      if (!res.ok) return setFilterSummary(null);
      const data = await res.json();
      setFilterSummary(data);
    } catch {
      setFilterSummary(null);
    }
  }, [baseUrl]);

  const fetchAppConfig = useCallback(async () => {
    try {
      const res = await apiFetch('/api/app-config');
      if (res.ok) {
        const data = await res.json();
        setAppConfig(data);
      }
    } catch {
      setAppConfig({ autoWhisperConvert: false });
    }
  }, []);

  const saveAppConfig = useCallback(async (updates) => {
    try {
      const res = await apiFetch('/api/app-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await fetchAppConfig();
        return true;
      }
      return false;
    } catch (e) {
      console.error('saveAppConfig failed:', e);
      throw e;
    }
  }, [fetchAppConfig]);

  const fetchFailedVideos = useCallback(async (id) => {
    try {
      const res = await fetch(dataUrl(`${id}/failed_videos.json?t=${Date.now()}`), { cache: 'no-store' });
      if (!res.ok) return setFailedVideos([]);
      const data = await res.json();
      setFailedVideos(Array.isArray(data) ? data : []);
    } catch {
      setFailedVideos([]);
    }
  }, [baseUrl]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchDashboards(),
      fetchVideos(channelId),
      fetchConfig(channelId),
      fetchStatus(channelId),
      fetchFilterSummary(channelId),
      fetchFailedVideos(channelId),
      fetchAppConfig(),
      // 修复 transcript_index：同一视频多个文件时优先指向有实际字幕的
      apiFetch(apiUrl(`/regen-transcript-index?dashboard_id=${channelId}`), { method: 'POST' }).catch(() => {}),
    ]);
    setLoading(false);
  }, [channelId, fetchDashboards, fetchVideos, fetchConfig, fetchStatus, fetchFilterSummary, fetchFailedVideos, fetchAppConfig]);

  const runAnalysis = useCallback(async (mode = 'full', limit = null, dashboardId = null) => {
    setRunAnalysisLoading(true);
    try {
      const res = await apiFetch(apiUrl('/run-analysis'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, limit, dashboard_id: dashboardId || channelId }),
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      // Whisper 转换：轮询 status 直到 idle，再刷新以更新统计数据
      if (mode === 'whisper-missing') {
        const did = dashboardId || channelId;
        (async () => {
          for (let i = 0; i < 360; i++) {
            await new Promise((r) => setTimeout(r, 5000));
            try {
              const stRes = await fetch(dataUrl(`${did}/status.json?t=${Date.now()}`), { cache: 'no-store' });
              if (stRes.ok) {
                const st = await stRes.json();
                if (st?.status === 'idle') {
                  await refresh();
                  break;
                }
              }
            } catch {}
          }
        })();
      }
    } catch (e) {
      console.error('runAnalysis failed:', e);
    } finally {
      setRunAnalysisLoading(false);
    }
  }, [refresh, baseUrl, channelId]);

  useEffect(() => {
    setVideos([]);
    setVideosChannelId(channelId);
    refresh();
  }, [channelId]);
  useEffect(() => {
    fetchDashboards();
  }, [fetchDashboards]);

  useEffect(() => {
    fetchAppConfig();
  }, [fetchAppConfig]);

  return {
    dashboards,
    channelId,
    setChannelId,
    videosChannelId,
    videos,
    config,
    appConfig,
    saveAppConfig,
    status,
    filterSummary,
    failedVideos,
    loading,
    runAnalysis,
    runAnalysisLoading,
    error,
    refresh,
    fetchStatus: () => fetchStatus(channelId),
  };
}
