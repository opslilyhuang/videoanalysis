# 阿里云 ECS 部署指南

在单台 ECS 上部署前后端，Nginx 统一对外提供服务。

---

## 启动流程速查

| 环境 | 命令 | 说明 |
|------|------|------|
| **本地开发** | `python3 api.py` | 后端 8000 端口 |
| **本地开发** | `cd frontend && npm run dev` | 前端 5173 端口 |
| **阿里云** | `sudo systemctl start vedioanalysis-api` | systemd 托管后端 |
| **阿里云** | Nginx 托管 `frontend/dist` | 前端静态资源 |

⚠️ 本地开发时**前后端须同时运行**，否则字幕会显示「Failed to fetch」。

---

## 一、服务器准备

假设系统为 **Ubuntu 22.04**（其他发行版可类似调整）。

### 1. 安装依赖

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# Python 3.10+
sudo apt install -y python3 python3-pip python3-venv

# Node.js 18+（用于构建前端）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Nginx
sudo apt install -y nginx

# ffmpeg（Whisper 转录需要）
sudo apt install -y ffmpeg
```

---

## 二、上传代码

```bash
# 创建目录
sudo mkdir -p /var/www/vedioanalysis
sudo chown $USER:$USER /var/www/vedioanalysis
cd /var/www/vedioanalysis

# 方式 A：从 Git 拉取
git clone https://github.com/opslilyhuang/videoanalysis.git .

# 方式 B：本地打包后 scp 上传
# 本地执行：tar -czvf vedioanalysis.tar.gz --exclude=node_modules --exclude=palantir_analysis --exclude=__pycache__ .
# scp vedioanalysis.tar.gz root@你的服务器IP:/var/www/vedioanalysis/
# 服务器上：cd /var/www/vedioanalysis && tar -xzvf vedioanalysis.tar.gz
```

---

## 三、后端配置与运行

```bash
cd /var/www/vedioanalysis

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
nano .env   # 或 vim，填入 DEEPSEEK_API_KEY、OPENAI_API_KEY 等

# 测试运行（确保端口 8000 可访问）
python3 api.py
# 另开终端：curl http://localhost:8000/api/dashboards
# 有返回则正常，Ctrl+C 停止
```

---

## 四、前端构建

```bash
cd /var/www/vedioanalysis/frontend

# 安装依赖
npm install

# 构建（使用 .env.production，API 走相对路径 /api/，不走 localhost）
npm run build
```

⚠️ **重要**：构建时会读取 `frontend/.env.production`，其中 `VITE_API_BASE=` 为空，确保 API 请求使用相对路径（如 `/api/xxx`），由 Nginx 代理到后端。若误用本地 `.env`（含 `VITE_API_BASE=http://localhost:8000`）构建，用户通过公网 IP 访问时会请求 localhost 导致失败。

构建完成后，`frontend/dist` 目录即为静态资源。

---

## 五、用 systemd 管理 API 进程

```bash
sudo nano /etc/systemd/system/vedioanalysis-api.service
```

写入：

```ini
[Unit]
Description=VideoAnalysis API
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/vedioanalysis
Environment="PATH=/var/www/vedioanalysis/venv/bin"
ExecStart=/var/www/vedioanalysis/venv/bin/python api.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

若用 root 或当前用户运行，可把 `User`、`Group` 改成 `root` 或你的用户名，并确保该用户对项目目录有读权限。

```bash
# 若用 www-data，需授权
sudo chown -R www-data:www-data /var/www/vedioanalysis

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable vedioanalysis-api
sudo systemctl start vedioanalysis-api
sudo systemctl status vedioanalysis-api
```

---

## 六、Nginx 配置

```bash
sudo nano /etc/nginx/sites-available/vedioanalysis
```

写入（将 `你的域名或IP` 替换为实际域名或服务器公网 IP）：

```nginx
server {
    listen 80;
    server_name 你的域名或IP;

    root /var/www/vedioanalysis/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_read_timeout 300s;
    }

    location /data/ {
        alias /var/www/vedioanalysis/frontend/public/data/;
    }
}
```

启用配置并重启 Nginx：

```bash
sudo ln -sf /etc/nginx/sites-available/vedioanalysis /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 七、安全组与防火墙

- **阿里云控制台**：安全组放行 **80**（HTTP）、**443**（HTTPS，若用 SSL）。
- **服务器防火墙**（如 ufw）：
  ```bash
  sudo ufw allow 80
  sudo ufw allow 443
  sudo ufw enable
  ```

---

## 八、HTTPS（可选）

使用 Let's Encrypt：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名.com
```

证书会自动配置，后续可定时续期（`certbot renew`）。

---

## 九、更新部署

代码更新后：

```bash
cd /var/www/vedioanalysis
git pull   # 若用 Git

# 后端
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart vedioanalysis-api

# 前端
cd frontend && npm install && npm run build
# 无需重启 Nginx，静态文件已更新
```

---

## 十、常用命令

| 操作           | 命令                                |
|----------------|-------------------------------------|
| 查看 API 日志   | `sudo journalctl -u vedioanalysis-api -f` |
| 重启 API       | `sudo systemctl restart vedioanalysis-api` |
| 重载 Nginx     | `sudo systemctl reload nginx`       |

---

## 安全建议

- **修改默认登录**：默认账号 `admin` / `admin@2026`，生产环境务必在 `frontend/src/context/AuthContext.jsx` 中修改 `VALID_CREDS`。
- **环境变量**：`.env` 不要提交到 Git，妥善保管 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY` 等。

---

## 故障排查

### 一、所有 /api/* 请求 404（最常见）

**原因**：后端未运行，或 Nginx 未正确把 `/api/` 转发到后端。

**在服务器上依次执行：**

```bash
# 1. 检查后端是否运行
sudo systemctl status vedioanalysis-api
# 若 inactive，执行：sudo systemctl start vedioanalysis-api

# 2. 直接测后端（在服务器本地）
curl -s http://127.0.0.1:8000/api/dashboards
# 正常应返回 JSON；若 "Connection refused" 说明后端没起来

# 3. 检查 Nginx 是否代理了 /api/
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/api/dashboards
# 正常应返回 200 或 401（401 说明请求已到后端，只是未带 token）

# 4. 确认 Nginx 配置中有 location /api/
sudo nginx -T | grep -A5 "location /api"
# 应看到 proxy_pass http://127.0.0.1:8000
```

**常见修复：**

- 后端未启动：`sudo systemctl start vedioanalysis-api`
- Nginx 未启用该站点：`sudo ln -sf /etc/nginx/sites-available/vedioanalysis /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx`
- 仅部署了前端（如 Vercel）：必须同时在阿里云 ECS 部署后端并配置 Nginx 代理

### 二、右侧无字幕（但其他接口正常）

- 检查数据目录：`ls /var/www/vedioanalysis/frontend/public/data/palantirtech/transcripts/ | head`
- 若为空，需将本地的 `frontend/public/data/` 上传到服务器
- 可 `curl "http://127.0.0.1:8000/api/transcript/TekbB_X3mB4?dashboard_id=palantirtech"` 测试

### 三、端口占用

- 若 8000 被占，可改 `api.py` 的端口，并同步修改 Nginx `proxy_pass` 端口
