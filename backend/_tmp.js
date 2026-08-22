const http = require('http');

// Test directly what the endpoint returns
const opts = { hostname: '127.0.0.1', port: 5000, path: '/api/company/applications', headers: { 'Authorization': 'Bearer test' } };
http.get(opts, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', b.substring(0, 500));
  });
});
