module.exports = {
  apps: [
    {
      name: "shieldme-site",
      script: "prod-server.mjs",
      cwd: "/var/www/shieldme",
      interpreter: "/usr/bin/node",
      env: { NODE_ENV: "production", PORT: "3006", HOST: "127.0.0.1" },
      max_memory_restart: "300M",
      restart_delay: 5000,
    },
  ],
};
