/**
 * ecosystem.config.js — PM2 process configuration
 *
 * PORT FIX: env_file is unreliable across PM2 versions.
 * Instead, we read PORT from server/.env here and inject it into env:{}.
 * This guarantees PM2 always starts with the correct port.
 */
'use strict';
const path = require('path');
const fs   = require('fs');

function readEnvFile() {
  const envPath = path.join(__dirname, 'server', '.env');
  const result  = {};
  if (!fs.existsSync(envPath)) return result;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) {
      result[m[1]] = m[2].trim();
    }
  }
  return result;
}

const envVars = readEnvFile();

module.exports = {
  apps: [{
    name:   'mediamagnet',
    script: './server/index.js',
    cwd:    __dirname,
    env: {
      NODE_ENV:              envVars.NODE_ENV              || 'production',
      PORT:                  envVars.PORT                  || '3000',
      SPOTIFY_CLIENT_ID:     envVars.SPOTIFY_CLIENT_ID     || '',
      SPOTIFY_CLIENT_SECRET: envVars.SPOTIFY_CLIENT_SECRET || '',
      APPLE_MUSIC_TOKEN:     envVars.APPLE_MUSIC_TOKEN     || '',
      PATH: (process.env.PATH || '') + ':/usr/local/bin:/usr/bin:/bin',
    },
    autorestart:        true,
    watch:              false,
    max_memory_restart: '512M',
    out_file:        './logs/out.log',
    error_file:      './logs/err.log',
    merge_logs:      true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    kill_timeout:    10000,
    wait_ready:      true,
    listen_timeout:  8000,
  }],
};
