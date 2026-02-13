# 部署说明

## 1. 推送到 GitHub

本地已完成 commit，需你在本机完成 GitHub 认证后执行：

```bash
cd /Users/julianhuang/Desktop/vedioanalysis
git push -u origin main
```

若使用 SSH（需已配置 GitHub SSH key）：

```bash
git remote set-url origin git@github.com:opslilyhuang/videoanalysis.git
git push -u origin main
```

## 2. 部署到 Vercel

### 方式一：Vercel 控制台

1. 打开 [Vercel](https://vercel.com)，登录
2. **Add New** → **Project** → 选择 `opslilyhuang/videoanalysis`
3. 配置：
   - **Root Directory**: 留空（项目根目录）
   - **Framework Preset**: Vite
   - **Build Command**: `cd frontend && npm run build`
   - **Output Directory**: `frontend/dist`
4. 点击 **Deploy**

### 方式二：Vercel CLI

```bash
npm i -g vercel
cd /Users/julianhuang/Desktop/vedioanalysis
vercel
```

## 3. 重要说明

- **前端**：Vercel 只部署前端静态站点；视频列表、配置等静态数据在 `frontend/public/data` 中，会一并部署。
- **API 服务**：`api.py` 为 Python 后端，Vercel 不直接支持。如需智能报告、AI 对话、字幕转换等，需单独部署：
  - [Railway](https://railway.app)
  - [Render](https://render.com)
  - 或自有服务器
- 部署完成后，在 Vercel 环境变量中配置 `VITE_API_BASE` 指向你的 API 地址（例如 `https://your-api.railway.app`），然后重新构建。
