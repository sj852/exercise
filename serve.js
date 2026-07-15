/* 의존성 없는 정적 파일 서버 — 오운완 로컬 실행용
   사용: node serve.js [포트]   (기본 8000) */
var http = require('http');
var fs = require('fs');
var path = require('path');

var root = __dirname;
var port = parseInt(process.argv[2], 10) || 8000;

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

http.createServer(function (req, res) {
  var urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  var filePath = path.join(root, urlPath);
  // 프로젝트 폴더 밖 접근 차단
  if (filePath.indexOf(root) !== 0) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    var ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate'  // 개발용: 항상 최신 파일 제공
    });
    res.end(data);
  });
}).listen(port, function () {
  console.log('오운완 서버 실행 중  ->  http://localhost:' + port + '/');
  console.log('종료: 이 창에서 Ctrl+C');
});
