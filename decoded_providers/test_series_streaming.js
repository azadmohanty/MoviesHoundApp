const https = require('https');

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
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

// 1. Test Torrentio Series Extraction (Breaking Bad S01E01 - IMDb tt0903747)
async function testTorrentioSeries(imdbId = 'tt0903747', season = 1, episode = 1) {
  const url = `https://torrentio.strem.fun/limit=4/stream/series/${imdbId}:${season}:${episode}.json`;
  console.log(`\n--- [1. Torrentio TV Series Stream Test] ---`);
  console.log(`[URL] ${url}`);
  try {
    const res = await fetch(url);
    console.log(`[Status] ${res.status}`);
    const data = JSON.parse(res.text);
    const streams = data.streams || [];
    console.log(`[Streams Found for S${season}E${episode}] ${streams.length}`);
    if (streams.length > 0) {
      console.log(JSON.stringify(streams.slice(0, 2), null, 2));
    }
  } catch (err) {
    console.error(`[Torrentio Error]`, err.message);
  }
}

// 2. Test MovieBox Series Extraction (SubjectType 2 + &se=season&ep=episode)
async function testMovieBoxSeries(query = 'Loki', season = 1, episode = 1) {
  const HOST = 'h5-api.aoneroom.com';
  const BASE_URL = `https://${HOST}`;
  console.log(`\n--- [2. MovieBox TV Series Stream Test] ---`);

  // Step 1: Token
  const pkgRes = await fetch(`${BASE_URL}/wefeed-h5api-bff/app/get-latest-app-pkgs?app_name=moviebox`);
  const xUser = pkgRes.headers['x-user'];
  if (!xUser) return console.error('x-user missing');
  const token = JSON.parse(xUser).token;

  const headers = {
    'X-Client-Info': '{"timezone":"Africa/Nairobi"}',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept': 'application/json',
    'Referer': BASE_URL,
    'Host': HOST,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // Step 2: Search Series (subjectType = 2)
  console.log(`[Searching Series "${query}" with subjectType = 2]`);
  const searchRes = await fetch(`${BASE_URL}/wefeed-h5api-bff/subject/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ keyword: query, page: 1, perPage: 10, subjectType: 2 })
  });
  const searchData = JSON.parse(searchRes.text);
  const items = searchData.data?.data?.items || searchData.data?.items || [];
  console.log(`[Series Returned] ${items.length}`);
  if (items.length === 0) return;

  const subjectId = items[0].subjectId;
  console.log(`[Selected Series] ${items[0].title} (ID: ${subjectId})`);

  // Step 3: Fetch Detail Path
  const detailRes = await fetch(`https://h5.aoneroom.com/wefeed-h5-bff/web/post/list/subject?id=${subjectId}`);
  const detailData = JSON.parse(detailRes.text);
  const detailPath = detailData.data?.items?.[0]?.subject?.detailPath || '';

  // Step 4: Fetch Stream for Season & Episode
  console.log(`[Fetching Direct MP4 Stream for S${season}E${episode}]`);
  const downloadHeaders = {
    ...headers,
    'Referer': `https://fmoviesunblocked.net/spa/videoPlayPage/movies/${detailPath}?id=${subjectId}&type=/movie/detail`,
    'Origin': 'https://fmoviesunblocked.net'
  };

  const dlRes = await fetch(`${BASE_URL}/wefeed-h5api-bff/subject/download?subjectId=${subjectId}&se=${season}&ep=${episode}`, {
    headers: downloadHeaders
  });
  const dlData = JSON.parse(dlRes.text);
  const downloads = dlData.data?.data?.downloads || dlData.data?.downloads || [];
  console.log(`[Direct MP4 Streams for S${season}E${episode}] ${downloads.length}`);
  console.log(JSON.stringify(downloads, null, 2));
}

async function runTests() {
  await testTorrentioSeries('tt0903747', 1, 1);
  await testMovieBoxSeries('Loki', 1, 1);
}

runTests();
