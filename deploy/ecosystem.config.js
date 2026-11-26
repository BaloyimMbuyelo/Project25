// PM2 process file (System Design 4.3.3). Keeps the API running and restarts
// it after a crash or a server reboot. Settings are read from backend/.env.
module.exports = {
    apps: [
        {
            name: 'ubms-api',
            cwd: `${__dirname}/../backend`,
            script: 'server.js',
            instances: 1,
            env: { NODE_ENV: 'production' },
            max_memory_restart: '300M',
            time: true
        }
    ]
};
