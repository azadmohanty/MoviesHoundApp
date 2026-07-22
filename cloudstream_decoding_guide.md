# AI Agent Protocol: CloudStream Plugin to React Native Scraper Porting Guide

This document defines the step-by-step instructions and code specifications for an AI Coding Assistant to reverse-engineer CloudStream Kotlin (`.kt`) extensions and port them into MoviesHound's React Native scraping engine.

---

## 1. AI Assistant Directive
When the user requests you to **"port/integrate a new CloudStream provider"** (e.g., Bollyflix, Einthusan, Vegamovies), you MUST follow this protocol:

1. **Locate & Fetch**: Retrieve the raw Kotlin source file (`.kt`) from the public GitHub/Codeberg repositories.
2. **Decode**: Map the Kotlin class properties (Base URL, Search selectors, Link extraction, Decryption tokens) to JavaScript/TypeScript.
3. **Build Scraper**: Create a standard scraper module matching the template below.
4. **Test**: Write a test script under `scratch/` and execute it via Node.js to verify it extracts streams successfully.
5. **Integrate**: Register the scraper inside the MoviesHound search/download lifecycle.

---

## 2. Step-by-Step Porting Steps

### Step A: Fetching the Source Code
Locate the provider file under `src/main/kotlin/com/...` in the repository.
* **Megix (Bollywood/Hindi)**: `https://github.com/SaurabhKaperwan/CSX`
* **Phisher (Anime/Global)**: `https://github.com/phisher98/cloudstream-extensions-phisher`
* **CNC Verse (Hotstar/Netflix clones)**: `https://github.com/NivinCNC/CNCVerse-Cloud-Stream-Extension`
* **English Repos**: `https://codeberg.org/cloudstream/cloudstream-extensions-multilingual`

Use curl or HTTP requests to fetch the raw file content (e.g., `BollyflixProvider.kt`).

### Step B: Mapping HTML Selectors
Kotlin CloudStream plugins use Jsoup for HTML parsing. Map them to JS as follows:
* Kotlin: `document.select("div.post-card")`  
  ➡️ JavaScript: `document.querySelectorAll('div.post-card')`
* Kotlin: `element.attr("href")`  
  ➡️ JavaScript: `element.getAttribute('href')`
* Kotlin: `element.text()`  
  ➡️ JavaScript: `element.textContent`

### Step C: Decoding Link Decryptors (AES/Base64)
If the Kotlin code uses a decryption block (e.g., `decryptAes(encrypted, key)`), look for the encryption key inside the file. Replicate it in JavaScript using `crypto-js` or similar libraries:
```javascript
const CryptoJS = require('crypto-js');
const decrypted = CryptoJS.AES.decrypt(encryptedText, CryptoJS.enc.Utf8.parse(key), {
    iv: CryptoJS.enc.Utf8.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
}).toString(CryptoJS.enc.Utf8);
```

---

## 3. Standard JS Scraper Interface Template

Every ported scraper must match this clean structure:

```typescript
// src/utils/scrapers/[ProviderName]Scraper.ts
import { SearchResult } from '../parser';

export interface ScraperConfig {
  siteName: string;
  baseUrl: string;
}

export const scrapeLinks = async (
  html: string,
  config: ScraperConfig
): Promise<SearchResult[]> => {
  const results: SearchResult[] = [];
  
  // 1. Load HTML into a virtual DOM parser or use Regex
  // 2. Query selectors matching the Kotlin source definitions
  // 3. Extract title, link, and quality parameters
  
  return results;
};
```

---

## 4. Integration into MoviesHound

To hook the scraper into the app:
1. Open [HomeScreen.tsx](file:///d:/2026/OWN_APP/src/screens/HomeScreen.tsx).
2. Inside `handleWebViewMessage(siteKey, html)`:
   * Match the `siteKey` (e.g., `'Bollyflix'`).
   * Pass the `html` to your custom `scrapeLinks` resolver.
   * Add the parsed links to the global `results` state array:
     ```typescript
     const parsedResults = await scrapeLinks(html, { siteName: 'Bollyflix', baseUrl });
     setResults(prev => [...prev, ...parsedResults]);
     ```

---

## 5. Verification Checklist for the AI
Before declaring the task complete, you MUST:
1. Verify the scraper returns valid `.m3u8` or file-locker download URLs.
2. Confirm the scraper script successfully handles redirects.
3. Run `npx tsc` to check for compilation issues.
