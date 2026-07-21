import * as htmlparser2 from 'htmlparser2';

export type SearchResult = {
  title: string;
  link: string;
  siteName: string;
  category: string;
};

export const parseHTML = (html: string, siteKey: string, category: string, baseUrl?: string): SearchResult[] => {
  const extracted: SearchResult[] = [];
  let currentTag = '';
  let currentHref = '';
  let textContent = '';
  let insideHeading = false;

  const parser = new htmlparser2.Parser({
    onopentag(name, attribs) {
      currentTag = name;
      if (name === 'h2' || name === 'h3' || name === 'h1') {
        insideHeading = true;
      }
      if (name === 'a' && attribs.href) {
        currentHref = attribs.href;
      }
    },
    ontext(text) {
      if (currentHref && text.trim().length > 0) {
        textContent += text;
      }
    },
    onclosetag(name) {
      if (name === 'h2' || name === 'h3' || name === 'h1') {
        insideHeading = false;
      }
      if (name === 'a') {
        const cleanText = textContent.trim();
        const cleanHref = currentHref.trim();

        // Standard filter to exclude category/page/tag links
        const isInvalid = 
          cleanHref.includes('/category/') ||
          cleanHref.includes('/tag/') ||
          cleanHref.includes('/page/') ||
          cleanHref.includes('/dmca/') ||
          cleanHref.includes('/contact-') ||
          cleanHref.includes('/privacy-policy/') ||
          cleanHref === '#' ||
          cleanHref.startsWith('javascript:') ||
          cleanText.toLowerCase().includes('how to download') ||
          cleanText.toLowerCase() === 'how to';

        if (cleanHref && cleanText.length > 5 && !isInvalid) {
          if (insideHeading || cleanText.toLowerCase().includes('download') || cleanText.toLowerCase().includes('season')) {
            let finalLink = cleanHref;
            if (finalLink.startsWith('//')) {
              finalLink = 'https:' + finalLink;
            } else if (finalLink.startsWith('/')) {
              if (baseUrl) {
                finalLink = baseUrl.replace(/\/$/, '') + finalLink;
              }
            } else if (!finalLink.startsWith('http://') && !finalLink.startsWith('https://')) {
              if (baseUrl) {
                finalLink = baseUrl.replace(/\/$/, '') + '/' + finalLink;
              } else {
                finalLink = 'https://' + finalLink;
              }
            }

            extracted.push({
              title: cleanText.replace(/\s+/g, ' '),
              link: finalLink,
              siteName: siteKey,
              category: category
            });
          }
        }
        currentHref = '';
        textContent = '';
      }
    }
  });

  parser.write(html);
  parser.end();

  // Deduplicate items based on link
  const uniqueMap = new Map<string, SearchResult>();
  extracted.forEach(item => uniqueMap.set(item.link, item));
  return Array.from(uniqueMap.values());
};
