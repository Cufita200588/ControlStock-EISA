module.exports = {
  apps: [
    {
      name: "control-eisa-api",
      script: "src/index.js",
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 8081
      }
    }
  ]
};
