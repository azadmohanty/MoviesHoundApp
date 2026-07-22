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

function doubleAtobDecode(html) {
  const match = /var\s+url\s*=\s*atob\s*\(\s*atob\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/.exec(html);
  if (match) {
    try {
      const firstPass = Buffer.from(match[1], 'base64').toString('utf-8');
      const secondPass = Buffer.from(firstPass, 'base64').toString('utf-8');
      return secondPass;
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function testVegaMovies(query) {
  const baseUrl = 'https://vegamovies.navy';
  const searchUrl = `${baseUrl}/search.php?q=${encodeURIComponent(query)}&page=1`;
  console.log(`[Step 1: Searching VegaMovies API] ${searchUrl}`);

  try {
    const res = await fetch(searchUrl);
    console.log(`[Status] ${res.status}`);
    const data = JSON.parse(res.text);
    const hits = data.hits || [];
    console.log(`[Hits Count] ${hits.length}`);

    if (hits.length > 0) {
      const permalink = hits[0].document.permalink;
      const movieUrl = `${baseUrl}${permalink}`;
      console.log(`\n[Step 2: Fetching Movie Page] ${movieUrl}`);
      const pageRes = await fetch(movieUrl);

      const buttonRegex = /<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<button[^>]+class="[^"]*dwd-button[^"]*"[^>]*>([\s\S]*?)<\/button>[\s\S]*?<\/a>/gi;
      let match;
      const buttons = [];
      while ((match = buttonRegex.exec(pageRes.text)) !== null) {
        const href = match[1];
        if (href.includes('nexdrive') || href.includes('vegamovies')) {
          buttons.push(href);
        }
      }

      console.log(`[Intermediate Locker Links Found] ${buttons.length}`);
      const targetLocker = buttons.find(b => b.includes('nexdrive')) || buttons[0];
      if (targetLocker) {
        console.log(`\n[Step 3: Fetching Intermediate Locker] ${targetLocker}`);
        const lockerRes = await fetch(targetLocker);
        const vcloudMatch = /<a[^>]+href="([^"]*vcloud[^"]*)"[^>]*>/i.exec(lockerRes.text);
        if (vcloudMatch) {
          const vcloudUrl = vcloudMatch[1];
          console.log(`[Step 4: Fetching VCloud Page] ${vcloudUrl}`);
          const vcloudRes = await fetch(vcloudUrl);
          const decodedStreamUrl = doubleAtobDecode(vcloudRes.text);
          console.log(`[Decoded Final Stream Token Link] ${decodedStreamUrl}`);
        }
      }
    }
  } catch (err) {
    console.error(`[VegaMovies Error]`, err.message);
  }
}

testVegaMovies('Avatar');
