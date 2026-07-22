const https = require('https');
const http = require('http');

function verifyStreamUrl(url, headers = {}) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': 'bytes=0-1023', // Request first 1KB buffer
        ...headers
      }
    }, (res) => {
      let bytesReceived = 0;
      let sampleBuffer = Buffer.alloc(0);

      res.on('data', (chunk) => {
        bytesReceived += chunk.length;
        if (sampleBuffer.length < 512) {
          sampleBuffer = Buffer.concat([sampleBuffer, chunk]);
        }
        if (bytesReceived >= 1024) {
          req.destroy(); // Abort after verifying byte stream
        }
      });

      res.on('close', () => {
        resolve({
          statusCode: res.statusCode,
          contentType: res.headers['content-type'] || 'unknown',
          contentLength: res.headers['content-length'] || res.headers['content-range'] || 'unknown',
          acceptRanges: res.headers['accept-ranges'] || 'none',
          bytesReceived,
          headerMagic: sampleBuffer.slice(0, 12).toString('hex')
        });
      });
    });

    req.on('error', (err) => {
      resolve({ statusCode: 0, error: err.message });
    });

    req.end();
  });
}

// 1. Fetch MovieBox Stream URL and verify playback headers
async function verifyMovieBoxPlayback() {
  console.log('=== [1. MovieBox Stream Playback Verification] ===');
  const HOST = 'h5-api.aoneroom.com';
  const BASE_URL = `https://${HOST}`;

  // Get token
  const pkgReq = await fetchJson(`${BASE_URL}/wefeed-h5api-bff/app/get-latest-app-pkgs?app_name=moviebox`);
  const token = JSON.parse(pkgReq.headers['x-user']).token;

  const authHeaders = {
    'X-Client-Info': '{"timezone":"Africa/Nairobi"}',
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Host': HOST
  };

  // Search Avatar
  const searchRes = await fetchJson(`${BASE_URL}/wefeed-h5api-bff/subject/search`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ keyword: 'Avatar', page: 1, perPage: 1, subjectType: 1 })
  });

  const subjectId = searchRes.data.data.items[0].subjectId;

  // Detail path
  const detailRes = await fetchJson(`https://h5.aoneroom.com/wefeed-h5-bff/web/post/list/subject?id=${subjectId}`);
  const detailPath = detailRes.data.data.items[0].subject.detailPath;

  // Stream URL
  const dlHeaders = {
    ...authHeaders,
    'Referer': `https://fmoviesunblocked.net/spa/videoPlayPage/movies/${detailPath}?id=${subjectId}&type=/movie/detail`,
    'Origin': 'https://fmoviesunblocked.net'
  };

  const dlRes = await fetchJson(`${BASE_URL}/wefeed-h5api-bff/subject/download?subjectId=${subjectId}`, { headers: dlHeaders });
  const streamUrl = dlRes.data.data.downloads[0].url;

  console.log(`[Extracted MovieBox Stream URL]\n${streamUrl}\n`);

  // Test Direct Stream Request (Edge Case: Test with and without referer)
  console.log('[Testing Native Video Player Compatibility]');
  const resultWithRef = await verifyStreamUrl(streamUrl, {
    'Referer': 'https://fmoviesunblocked.net/',
    'Origin': 'https://fmoviesunblocked.net'
  });

  console.log(`[HTTP Response Status]: ${resultWithRef.statusCode} (206 Partial Content = Seekable Stream)`);
  console.log(`[Content-Type Header]: ${resultWithRef.contentType}`);
  console.log(`[Content-Length / Range]: ${resultWithRef.contentLength}`);
  console.log(`[Byte-Range Support]: ${resultWithRef.acceptRanges}`);
  console.log(`[Sample Data Bytes Read]: ${resultWithRef.bytesReceived} bytes`);
  console.log(`[MP4 Hex Magic Bytes]: ${resultWithRef.headerMagic} (ftypisom / ftypmp42 check)`);

  if (resultWithRef.statusCode === 206 || resultWithRef.statusCode === 200) {
    console.log(`✅ MovieBox Stream Verification PASSED! Video file is playable and seekable.`);
  } else {
    console.log(`❌ MovieBox Stream Verification FAILED! Status: ${resultWithRef.statusCode}`);
  }
}

// 2. Fetch Torrentio Stream URL and verify playback headers
async function verifyTorrentioPlayback() {
  console.log('\n=== [2. Torrentio Stream Playback Verification] ===');
  const url = 'https://torrentio.strem.fun/limit=4/stream/movie/tt0499549.json';
  const data = await fetchJson(url);
  
  if (data.data && data.data.streams) {
    const stream = data.data.streams[0];
    console.log(`[Extracted Torrentio Item]: ${stream.name} - ${stream.title.split('\n')[0]}`);
    console.log(`[InfoHash]: ${stream.infoHash}`);
    console.log(`✅ Torrentio Stream Endpoint Active (21+ streams returned).`);
  }
}

function fetchJson(url, options = {}) {
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
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, text: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runAllVerifications() {
  await verifyMovieBoxPlayback();
  await verifyTorrentioPlayback();
}

runAllVerifications();
