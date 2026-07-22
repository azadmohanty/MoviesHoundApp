const https = require('https');
const http = require('http');

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
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

async function testMovieBox(query = 'Avatar') {
  const HOST = 'h5-api.aoneroom.com';
  const BASE_URL = `https://${HOST}`;
  console.log(`--- Testing Reverse-Engineered MovieBox API ---`);

  // Step 1: Token
  console.log(`[Step 1: Fetching Dynamic JWT Token]`);
  const pkgRes = await fetch(`${BASE_URL}/wefeed-h5api-bff/app/get-latest-app-pkgs?app_name=moviebox`);
  const xUser = pkgRes.headers['x-user'];
  if (!xUser) return console.error('x-user header missing');
  const token = JSON.parse(xUser).token;
  console.log(`[Token] ${token.substring(0, 30)}...`);

  const headers = {
    'X-Client-Info': '{"timezone":"Africa/Nairobi"}',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept': 'application/json',
    'Referer': BASE_URL,
    'Host': HOST,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // Step 2: Search
  console.log(`\n[Step 2: Searching for "${query}"]`);
  const searchRes = await fetch(`${BASE_URL}/wefeed-h5api-bff/subject/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ keyword: query, page: 1, perPage: 10, subjectType: 1 })
  });
  const searchData = JSON.parse(searchRes.text);
  const items = searchData.data?.data?.items || searchData.data?.items || [];
  console.log(`[Items Returned] ${items.length}`);
  if (items.length === 0) return;

  const subjectId = items[0].subjectId;
  console.log(`[Selected] ${items[0].title} (ID: ${subjectId})`);

  // Step 3: Detail Path
  console.log(`\n[Step 3: Resolving detailPath]`);
  const detailRes = await fetch(`https://h5.aoneroom.com/wefeed-h5-bff/web/post/list/subject?id=${subjectId}`);
  const detailData = JSON.parse(detailRes.text);
  const detailPath = detailData.data?.items?.[0]?.subject?.detailPath || '';
  console.log(`[detailPath] ${detailPath}`);

  // Step 4: Stream Links
  console.log(`\n[Step 4: Extracting Direct MP4 CDN Streams]`);
  const downloadHeaders = {
    ...headers,
    'Referer': `https://fmoviesunblocked.net/spa/videoPlayPage/movies/${detailPath}?id=${subjectId}&type=/movie/detail`,
    'Origin': 'https://fmoviesunblocked.net'
  };

  const dlRes = await fetch(`${BASE_URL}/wefeed-h5api-bff/subject/download?subjectId=${subjectId}`, {
    headers: downloadHeaders
  });
  const dlData = JSON.parse(dlRes.text);
  const downloads = dlData.data?.data?.downloads || dlData.data?.downloads || [];
  console.log(`[Extracted Streams] ${downloads.length}`);
  console.log(JSON.stringify(downloads, null, 2));
}

testMovieBox('Avatar');
