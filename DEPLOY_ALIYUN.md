# 阿里云 ECS 部署指南

在单台 ECS 上部署前后端，Nginx 统一对外提供服务。

---

## 启动流程速查

| 环境 | 命令 | 说明 |
|------|------|------|
| **本地开发** | `python3 api.py` | 后端 8000 端口 |
| **本地开发** | `cd frontend && npm run dev` | 前端 5178 端口 |
| **阿里云** | `sudo systemctl start vedioanalysis-api` | systemd 托管后端 |
| **阿里云** | Nginx 托管 `frontend/dist` | 前端静态资源 |

⚠️ 本地开发时**前后端须同时运行**，否则字幕会显示「Failed to fetch」。

---

## 一、服务器准备

实际服务器为 **CentOS / Alibaba Cloud Linux**（以下命令适用于 CentOS 7+/AlmaLinux/Rocky Linux）。
如使用 Ubuntu 22.04，请见下方注释。

### 1. 安装依赖

**CentOS / Alibaba Cloud Linux**：

```bash
# 更新系统
sudo yum update -y

# Python 3.10+
sudo yum install -y python3 python3-pip

# Node.js 18+（用于构建前端）
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Nginx
sudo yum install -y nginx

# ffmpeg（Whisper 转录需要）
sudo yum install -y ffmpeg
```

**Ubuntu 22.04（参考）**：

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# Python 3.10+
sudo apt install -y python3 python3-pip python3-venv

# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Nginx
sudo apt install -y nginx

# ffmpeg
sudo apt install -y ffmpeg
```

---

## 二、上传代码

```bash
# 创建目录
sudo mkdir -p /opt/vedioanalysis
sudo chown $USER:$USER /opt/vedioanalysis
cd /opt/vedioanalysis

# 方式 A：从 Git 拉取
git clone https://github.com/opslilyhuang/videoanalysis.git .

# 方式 B：本地打包后 scp 上传
# 本地执行：tar -czvf vedioanalysis.tar.gz --exclude=node_modules --exclude=palantir_analysis --exclude=__pycache__ .
# scp vedioanalysis.tar.gz root@你的服务器IP:/opt/vedioanalysis/
# 服务器上：cd /opt/vedioanalysis && tar -xzvf vedioanalysis.tar.gz
```

---

## 三、后端配置与运行

```bash
cd /opt/vedioanalysis

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
nano .env   # 或 vim，填入 DEEPSEEK_API_KEY、OPENAI_API_KEY 等

# Whisper 无字幕转录（仅线上正式环境推荐）
# 当用户上传的 YouTube 视频无自带字幕时，会调用 OpenAI Whisper API 做语音转文字
# 在 .env 中添加：OPENAI_API_KEY=sk-xxx（仅用于 Whisper，不用于其他功能）
# 不配置时则回退到本地 openai-whisper（需 pip install openai-whisper）

# 测试运行（确保端口 8000 可访问）
python3 api.py
# 另开终端：curl http://localhost:8000/api/dashboards
# 有返回则正常，Ctrl+C 停止
```

---

## 四、前端构建

```bash
cd /opt/vedioanalysis/frontend

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
User=root
Group=root
WorkingDirectory=/opt/vedioanalysis
Environment="PATH=/opt/vedioanalysis/venv/bin"
ExecStart=/opt/vedioanalysis/venv/bin/python api.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

⚠️ **注意**：
- **CentOS/Alibaba Cloud Linux**：通常使用 `root` 用户运行服务（如实际服务器配置）
- **Ubuntu/Debian**：建议使用 `www-data` 用户，需授权目录权限

若用 www-data（Ubuntu/Debian），可改为：

```ini
User=www-data
Group=www-data
```

并授权：

```bash
sudo chown -R www-data:www-data /opt/vedioanalysis
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable vedioanalysis-api
sudo systemctl start vedioanalysis-api
sudo systemctl status vedioanalysis-api
```

---

## 六、Nginx 配置

⚠️ **注意**：项目内参考配置见 `deploy/nginx-vedioanalysis.conf`，部署时复制到服务器对应路径即可。

阿里云服务器通常使用 CentOS 或 Alibaba Cloud Linux，配置文件位于 `/etc/nginx/conf.d/`；Ubuntu/Debian 系统使用 `/etc/nginx/sites-available/`。

### CentOS / Alibaba Cloud Linux（实际服务器配置）

```bash
# 方式 A：从项目复制
sudo cp /opt/vedioanalysis/deploy/nginx-vedioanalysis.conf /etc/nginx/conf.d/vedioanalysis.conf
# 若 server_name 需改，编辑：sudo nano /etc/nginx/conf.d/vedioanalysis.conf

# 方式 B：手动创建
sudo nano /etc/nginx/conf.d/vedioanalysis.conf
```

写入（与 `deploy/nginx-vedioanalysis.conf` 一致）：

```nginx
server {
    listen 80;
    server_name 你的域名或IP;

    location / {
        root /opt/vedioanalysis/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location /data/ {
        alias /opt/vedioanalysis/frontend/public/data/;
        autoindex off;
    }
}
```

启用配置并重启 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Ubuntu / Debian（参考配置）

```bash
sudo nano /etc/nginx/sites-available/vedioanalysis
```

写入（将 `你的域名或IP` 替换为实际域名或服务器公网 IP）：

```nginx
server {
    listen 80;
    server_name 你的域名或IP;

    root /opt/vedioanalysis/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_read_timeout 300s;
    }

    location /data/ {
        alias /opt/vedioanalysis/frontend/public/data/;
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

- **服务器防火墙**：

  **CentOS / Alibaba Cloud Linux（使用 firewalld）**：
  ```bash
  sudo firewall-cmd --permanent --add-service=http
  sudo firewall-cmd --permanent --add-service=https
  sudo firewall-cmd --reload
  # 查看状态：sudo firewall-cmd --list-all
  ```

  **Ubuntu / Debian（使用 ufw）**：
  ```bash
  sudo ufw allow 80
  sudo ufw allow 443
  sudo ufw enable
  ```

---

## 八、HTTPS（可选）

使用 Let's Encrypt：

**CentOS / Alibaba Cloud Linux**：
```bash
sudo yum install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名.com
```

**Ubuntu / Debian**：
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名.com
```

证书会自动配置，后续可定时续期（`certbot renew`）。

---

## 九、更新部署

代码更新后：

```bash
cd /opt/vedioanalysis
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

1. **右侧无字幕/接口 404**
   - 检查 API 是否在跑：`curl http://localhost:8000/api/dashboards`
   - 检查 Nginx 的 `proxy_pass` 配置：
     - CentOS/Alibaba Cloud Linux：查看 `/etc/nginx/conf.d/vedioanalysis.conf`
     - Ubuntu/Debian：查看 `/etc/nginx/sites-available/vedioanalysis`
     - 确认 `proxy_pass` 是否为 `http://127.0.0.1:8000/api/;`（注意末尾的 `/api/`）

2. **数据目录与字幕不显示**  
   - 字幕、索引位于 `frontend/public/data/{dashboard_id}/transcripts/` 和 `transcript_index.json`  
   - 若右侧字幕不显示：检查服务器上 `frontend/public/data/palantirtech/transcripts/` 是否存在且含 `.txt` 文件；确认 API 对该目录有读权限  
   - 可 `curl http://localhost:8000/api/transcript-ready/视频ID?dashboard_id=palantirtech` 测试；若索引损坏可 POST `/api/regen-transcript-index?dashboard_id=palantirtech` 重建

3. **端口占用**
   - 若 8000 被占，可改 `api.py` 的端口，并同步修改 Nginx `proxy_pass` 端口

4. **所有 /api/* 请求 404**

   **症状**：前端页面正常打开，但所有 API 请求都返回 404

   **排查步骤**：

   ```bash
   # ① 检查 API 服务是否运行
   sudo systemctl status vedioanalysis-api
   # 或查看进程：ps aux | grep api.py

   # ② 测试后端直接访问（绕过 Nginx）
   curl http://127.0.0.1:8000/api/dashboards
   # 如果成功返回 JSON，说明后端正常

   # ③ 检查 Nginx 配置（参考项目内 deploy/nginx-vedioanalysis.conf）
   cat /etc/nginx/conf.d/vedioanalysis.conf
   # 确认关键配置：
   # - proxy_pass 后面是否带 /api/
   #   正确：proxy_pass http://127.0.0.1:8000/api/;
   #   这会把 /api/xxx 转发到后端 /api/xxx
   #
   # - 项目路径是否正确
   #   服务器路径：/opt/vedioanalysis

   # ④ 测试 Nginx 代理（通过域名/IP）
   curl http://59.110.21.174/api/dashboards
   # 如果失败但步骤②成功，说明 Nginx 配置有问题

   # ⑤ 检查 Nginx 错误日志
   tail -f /var/log/nginx/error.log
   # 常见错误：
   # - "connect() failed" → 后端没启动或端口不对
   # - "directory index of /xxx is forbidden" → 路径配置错误
   ```

   **常见原因**：

   - **proxy_pass 配置错误**：漏了末尾的 `/api/`，导致转发路径不匹配
   - **后端服务未启动**：`sudo systemctl start vedioanalysis-api`
   - **端口不一致**：Nginx 配置的端口与 api.py 监听端口不同
   - **路径错误**：确认项目部署在 `/opt/vedioanalysis`

   **修复后重载 Nginx**：
   ```bash
   sudo nginx -t                    # 测试配置
   sudo systemctl reload nginx     # 重载配置
   ```
