// PM2 process definition for the VPS deployment.
// Deployed to /opt/evchargeplanner by scripts/deploy-vps.sh.
module.exports = {
  apps: [
    {
      name: 'evcp-api',
      script: 'dist/node.js',
      cwd: '/opt/evchargeplanner',
      // Reminder dispatch runs in-process on a schedule, so a single instance is
      // required — clustering would send every reminder more than once.
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '256M',
      env_file: '/opt/evchargeplanner/.env',
      error_file: '/var/log/evcp-api.error.log',
      out_file: '/var/log/evcp-api.out.log',
      time: true,
    },
  ],
};
