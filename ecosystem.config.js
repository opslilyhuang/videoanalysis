module.exports = {
  apps: [{
    name: 'vedioanalysis-api',
    script: 'api.py',
    interpreter: './venv/bin/python',
    cwd: '/opt/vedioanalysis',
    env: { PYTHONUNBUFFERED: '1' },
    autorestart: true
  }]
};
