const https = require('https');
const http = require('http');

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(options.headers || {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function testCineStreamAPIs(imdbId = 'tt0499549') {
  console.log('--- Testing CineStream / Torrentio Stremio Addon ---');

  const torrentioUrl = `https://torrentio.strem.fun/limit=4/stream/movie/${imdbId}.json`;
  console.log(`[Testing Torrentio Stream Endpoint] ${torrentioUrl}`);
  try {
    const res = await fetch(torrentioUrl);
    console.log(`[Status] ${res.status}`);
    const data = JSON.parse(res.text);
    const streams = data.streams || [];
    console.log(`[Active Streams Extracted] ${streams.length}`);
    if (streams.length > 0) {
      console.log(JSON.stringify(streams.slice(0, 3), null, 2));
    }
  } catch (err) {
    console.error(`[CineStream Error]`, err.message);
  }
}

testCineStreamAPIs('tt0499549');
