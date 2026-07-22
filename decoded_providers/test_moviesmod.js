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

async function testMoviesmod(query) {
  const baseUrl = 'https://moviesmod.at';
  const searchUrl = `${baseUrl}/search/${encodeURIComponent(query)}/page/1`;
  console.log(`[Testing Moviesmod Search] URL: ${searchUrl}`);

  try {
    const res = await fetch(searchUrl);
    console.log(`[Response Code] ${res.status}`);
    
    const articleRegex = /<article[\s\S]*?>([\s\S]*?)<\/article>/gi;
    let match;
    const results = [];
    while ((match = articleRegex.exec(res.text)) !== null) {
      const articleContent = match[1];
      const titleMatch = /title="([^"]+)"/i.exec(articleContent);
      const hrefMatch = /href="([^"]+)"/i.exec(articleContent);
      const imgMatch = /(?:data-src|src)="([^"]+)"/i.exec(articleContent);

      if (titleMatch && hrefMatch) {
        results.push({
          title: titleMatch[1].replace(/^Download\s+/i, ''),
          url: hrefMatch[1],
          poster: imgMatch ? imgMatch[1] : null
        });
      }
    }

    console.log(`[Results Found] ${results.length}`);
    console.log(JSON.stringify(results.slice(0, 3), null, 2));

    if (results.length > 0) {
      console.log(`\n[Testing Moviesmod Detail Page] ${results[0].url}`);
      const pageRes = await fetch(results[0].url);
      const buttonRegex = /<a[^>]+class="[^"]*(?:maxbutton-download-links|maxbutton-episode-links|maxbutton-g-drive)[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let btnMatch;
      const buttons = [];
      while ((btnMatch = buttonRegex.exec(pageRes.text)) !== null) {
        let link = btnMatch[1];
        const text = btnMatch[2].replace(/<[^>]+>/g, '').trim();
        if (link.includes('url=')) {
          const base64Str = link.split('url=')[1].split('&')[0];
          try {
            link = Buffer.from(base64Str, 'base64').toString('utf-8');
          } catch (e) {}
        }
        buttons.push({ text, link });
      }
      console.log(`[Decoded Episode/Download Buttons] ${buttons.length}`);
      console.log(JSON.stringify(buttons.slice(0, 3), null, 2));
    }
  } catch (err) {
    console.error(`[Moviesmod Error]`, err.message);
  }
}

testMoviesmod('Avatar');
