module.exports = {
  apps: [
    {
      name: "norfood",
      script: ".output/server/index.mjs",
      instances: Number(process.env.NORFOOD_PM2_INSTANCES || 3),
      exec_mode: "cluster",
      max_memory_restart: "900M",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: process.env.PORT || 3000,
      },
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
