'use strict';
// Pure static file server for local preview. The app itself is fully client-side
// (no /api routes) — this just serves the files over HTTP so you can develop.
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  let u = new URL(req.url, 'http://localhost');
  let file = u.pathname === '/' ? '/index.html' : u.pathname;
  if (file.includes('..')) { res.statusCode = 403; return res.end(); }
  let target = path.join(root, file);
  fs.readFile(target, (err, data) => {
    if (err) {
      // SPA fallback: unknown path -> index.html (hash routing handles the rest)
      return fs.readFile(path.join(root, 'index.html'), (_, d) => {
        res.setHeader('Content-Type', mime['.html']); res.end(d);
      });
    }
    res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(process.env.PORT || 3000, () => console.log('FindJobs running at http://localhost:' + (process.env.PORT || 3000)));