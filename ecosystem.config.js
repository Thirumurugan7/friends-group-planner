// PM2 process definition for Waypoint.
// Runs the Next.js server (UI + /api routes) as ONE process on a dedicated port
// so it coexists with the other app already running on this server.
//
//   pm2 start ecosystem.config.js
//   pm2 save
//
// Secrets are NOT stored here — they live in `.env.production` on the server
// (gitignored), which `next start` loads automatically at runtime.

module.exports = {
  apps: [
    {
      name: "waypoint",
      cwd: __dirname,
      // Call the Next binary directly (more reliable under PM2 than `npm start`).
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3100",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3100",
      },
    },
  ],
};
