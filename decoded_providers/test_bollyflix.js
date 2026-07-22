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

function fetchLocation(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    }, (res) => {
      resolve({ status: res.statusCode, location: res.headers.location });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getLiveUrls() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json');
    return JSON.parse(res.text);
  } catch (e) {
    return { bollyflix: 'https://bollyflix.at' };
  }
}

async function testBollyflix(query) {
  const config = await getLiveUrls();
  const baseUrl = config.bollyflix || 'https://bollyflix.at';
  const searchUrl = `${baseUrl}/search/${encodeURIComponent(query)}/page/1/`;
  console.log(`[Testing Bollyflix Live Domain] ${searchUrl}`);

  try {
    const res = await fetch(searchUrl);
    console.log(`[Search Status] ${res.status}`);

    const articleRegex = /<article[\s\S]*?>([\s\S]*?)<\/article>/gi;
    let match;
    const results = [];
    while ((match = articleRegex.exec(res.text)) !== null) {
      const articleContent = match[1];
      const titleMatch = /title="([^"]+)"/i.exec(articleContent);
      const hrefMatch = /href="([^"]+)"/i.exec(articleContent);

      if (titleMatch && hrefMatch) {
        results.push({
          title: titleMatch[1].replace(/^Download\s+/i, ''),
          url: hrefMatch[1]
        });
      }
    }

    console.log(`[Results Found] ${results.length}`);
    console.log(JSON.stringify(results.slice(0, 2), null, 2));

    if (results.length > 0) {
      console.log(`\n[Fetching Detail Page] ${results[0].url}`);
      const pageRes = await fetch(results[0].url);
      const linkRegex = /<a[^>]+class="[^"]*(?:maxbutton-download-links|dl|btnn)[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let btnMatch;
      const buttons = [];
      while ((btnMatch = linkRegex.exec(pageRes.text)) !== null) {
        buttons.push({ text: btnMatch[2].replace(/<[^>]+>/g, '').trim(), href: btnMatch[1] });
      }

      console.log(`[Download Buttons Found] ${buttons.length}`);
      console.log(JSON.stringify(buttons.slice(0, 3), null, 2));

      const fastdlItem = buttons.find(b => b.href.includes('fastdlserver'));
      if (fastdlItem) {
        console.log(`\n[Testing fastdlserver 302 Location Redirect] ${fastdlItem.href}`);
        const locRes = await fetchLocation(fastdlItem.href);
        console.log(`[FastDL Status] ${locRes.status}`);
        console.log(`[Decoded File Locker Mirror] ${locRes.location}`);
      }
    }
  } catch (err) {
    console.error(`[Bollyflix Error]`, err.message);
  }
}

testBollyflix('Pathaan');
