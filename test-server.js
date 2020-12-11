/* Used for running mocha tests */
const connect = require('connect');
const serveStatic = require('serve-static');
const port = 9001;
connect().use(serveStatic(__dirname)).listen(port, () => {
    const url = `http://localhost:${port}/test/test.html`;
    console.log(`Test Server Started. Open browser to ${url}`);
    const start = (process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open');
    require('child_process').exec(start + ' ' + url);
});
