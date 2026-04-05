const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'monitoring_log.html' : req.url);
    if (req.url === '/') filePath = path.join(__dirname, 'monitoring_log.html');

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': getContentType(filePath) });
        res.end(data);
    });
});

function getContentType(filePath) {
    const ext = path.extname(filePath);
    switch (ext) {
        case '.html': return 'text/html';
        case '.css': return 'text/css';
        case '.js': return 'text/javascript';
        default: return 'text/plain';
    }
}

server.listen(8000, () => {
    console.log('Server running at http://localhost:8000');
});