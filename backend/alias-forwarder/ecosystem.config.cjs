module.exports = {
  apps: [
    {
      name: 'alias-forwarder',
      script: 'dist/index.js',
      cwd: '/opt/shieldme/alias-forwarder',
      interpreter: 'node',
      env: { NODE_ENV: 'production', PORT: '4005' },
      max_memory_restart: '300M',
      restart_delay: 5000,
    },
    {
      name: 'shieldme-smtp',
      script: 'dist/smtp/smtp.server.js',
      cwd: '/opt/shieldme/alias-forwarder',
      interpreter: 'node',
      env: { NODE_ENV: 'production', PORT: '4005' },
      max_memory_restart: '300M',
      restart_delay: 5000,
    },
    {
      name: 'shieldme-worker',
      script: 'dist/workers/forwarding.worker.js',
      cwd: '/opt/shieldme/alias-forwarder',
      interpreter: 'node',
      env: { NODE_ENV: 'production', PORT: '4005' },
      max_memory_restart: '300M',
      restart_delay: 5000,
    },
    {
      // MNC-708 Stage 2: reverse-reply relay worker. Inert until
      // INBOUND_REPLY_ENABLED=true (dark by default).
      name: 'shieldme-reverse-reply-worker',
      script: 'dist/workers/reverse-reply.worker.js',
      cwd: '/opt/shieldme/alias-forwarder',
      interpreter: 'node',
      env: { NODE_ENV: 'production', PORT: '4005' },
      max_memory_restart: '300M',
      restart_delay: 5000,
    },
  ],
};
