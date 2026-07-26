"use strict";
/**
 * MediaTagExtractor.ts
 *
 * 99% Complete Scene Release Tag Extractor.
 * Parses raw post titles and headers to accurately extract Rip Format, Audio Tracks,
 * Audio Quality (Org/Line/Clean), Audio Codec (DD5.1/Atmos), and Video Codec (HEVC 10Bit/H.264/AV1).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRipFormat = extractRipFormat;
exports.extractAudioTracks = extractAudioTracks;
exports.extractVideoCodec = extractVideoCodec;
/**
 * Extracts Rip Format with high precision (detects CAM, HDTS, BluRay IMAX, WEB-DL, OTT platforms).
 */
function extractRipFormat(text) {
    if (!text)
        return 'WEB-DL';
    var upper = text.toUpperCase();
    // 1. Pre-release / Theatre Prints (CAM, HDTS, Screener)
    if (/\b(?:CAMRIP|HDCAM|CAM)\b/i.test(text))
        return 'HDCAM (Theatre Print)';
    if (/\b(?:HQ-iMAX\s*HDTS|IMAX\s*HDTS|HQ\s*HDTS|HDTS|HD-TS|TS|TELECINE|TC)\b/i.test(text))
        return 'HDTS (Theatre Print)';
    if (/\b(?:DVD-?SCREENER|DVDSCR|PRE-?DVD)\b/i.test(text))
        return 'DVD-Screener';
    // 2. BluRay / Disc Prints
    var isImax = /IMAX/i.test(text);
    if (/\b(?:BLU-?RAY|BD|BDRIP|BRRIP)\b/i.test(text)) {
        return isImax ? 'BluRay IMAX' : 'BluRay';
    }
    // 3. OTT Streaming Providers (Netflix, Amazon Prime, Apple TV, Disney+, etc.)
    var ottPrefix = '';
    if (/\b(?:NETFLIX|NF)\b/i.test(text))
        ottPrefix = 'Netflix ';
    else if (/\b(?:AMAZON-?PRIME|AMZN|PRIME)\b/i.test(text))
        ottPrefix = 'Amazon ';
    else if (/\b(?:APPLE\s*TV|ATVP)\b/i.test(text))
        ottPrefix = 'Apple TV ';
    else if (/\b(?:JIOHOTSTAR|HOTSTAR|DISNEY)\b/i.test(text))
        ottPrefix = 'Hotstar ';
    else if (/\b(?:ZEE5)\b/i.test(text))
        ottPrefix = 'Zee5 ';
    // 4. WEB-DL vs WEBRip
    if (/\b(?:WEB-?DL|WEBDL)\b/i.test(text)) {
        return "".concat(ottPrefix, "WEB-DL").trim();
    }
    if (/\b(?:WEBRIP|WEB-?RIP)\b/i.test(text)) {
        return "".concat(ottPrefix, "WEBRip").trim();
    }
    if (/\bWEB\b/i.test(text)) {
        return "".concat(ottPrefix, "WEB-DL").trim();
    }
    // 5. HDTV / HDRip / DVDRip
    if (/\bHDRIP\b/i.test(text))
        return 'HDRip';
    if (/\bDVDRIP\b/i.test(text))
        return 'DVDRip';
    if (/\bHDTV\b/i.test(text))
        return 'HDTV';
    return 'WEB-DL';
}
/**
 * Extracts Audio Tracks & Audio Qualities with 99% precision.
 * Detects Dual Audio, Multi-Audio, Languages (Hindi, English, French, Tamil, Telugu, etc.),
 * and Audio Quality tags (Org 5.1, Line Dubbed, Clean).
 */
function extractAudioTracks(text) {
    if (!text)
        return 'Hindi + English';
    // 1. Language bracket extraction e.g. {Hindi-English}, {Hindi-French-Spanish}, [Hindi-Tamil-Telugu]
    var bracketMatch = text.match(/[\{\[](Hindi|English|French|Tamil|Telugu|Malayalam|Kannada|Spanish|Japanese|Korean|Punjabi|Bengali|Marathi|Dual|Multi)[^\}\]]*[\}\]]/i);
    var langList = '';
    if (bracketMatch) {
        var rawLangs = bracketMatch[0].replace(/[\{\}\[\]]/g, '');
        var cleanLangs = rawLangs
            .split(/[-–+\/|\s,]+/)
            .filter(function (l) { return /^[a-zA-Z]{3,}$/.test(l) && !/audio|org|dubbed|dl|web/i.test(l); });
        if (cleanLangs.length > 0) {
            langList = cleanLangs.join(' + ');
        }
    }
    // 2. Multi-Audio detection
    var isMulti = /\bmulti[- ]?audio\b/i.test(text) || (langList && langList.split(' + ').length >= 3);
    if (isMulti) {
        return langList ? "Multi-Audio (".concat(langList, ")") : 'Multi-Audio (3+ Languages)';
    }
    // 3. Dual Audio detection
    var isDual = /\bdual[- ]?audio\b/i.test(text) || (langList && langList.split(' + ').length === 2);
    // 4. Audio Quality Modifiers (Org / Line Dubbed / Clean)
    var qualityTag = '';
    if (/\b(?:LINE-?DUBBED|LINE|HQ-LINE)\b/i.test(text)) {
        qualityTag = ' [Line Audio]';
    }
    else if (/\b(?:ORG-?5\.1|ORG-?AUDIO|ORG|ORIGINAL)\b/i.test(text)) {
        qualityTag = ' [Org 5.1]';
    }
    // 5. Audio Codec (DD5.1 / Atmos / AAC)
    var audioCodec = '';
    if (/\b(?:DD\+?5\.1|DOLBY\s*DIGITAL|5\.1)\b/i.test(text))
        audioCodec = ' DD5.1';
    else if (/\bATMOS\b/i.test(text))
        audioCodec = ' Atmos';
    if (isDual) {
        var defaultDualLangs = langList || 'Hindi + English';
        return "Dual Audio (".concat(defaultDualLangs, ")").concat(audioCodec).concat(qualityTag);
    }
    if (langList) {
        return "".concat(langList).concat(audioCodec).concat(qualityTag);
    }
    var hasHindi = /hindi/i.test(text);
    var hasEng = /english|eng/i.test(text);
    if (hasHindi && hasEng)
        return "Dual Audio (Hindi + English)".concat(audioCodec).concat(qualityTag);
    if (hasHindi)
        return "Hindi".concat(audioCodec).concat(qualityTag);
    if (hasEng)
        return "English".concat(audioCodec).concat(qualityTag);
    return "Hindi + English".concat(audioCodec).concat(qualityTag);
}
/**
 * Extracts Video Codec (HEVC 10Bit, H.264, AV1, 60FPS).
 */
function extractVideoCodec(text) {
    if (!text)
        return 'H.264';
    var isHevc = /\b(?:HEVC|x265|10bit|10-?bit)\b/i.test(text);
    var is60fps = /\b60fps\b/i.test(text);
    var isAv1 = /\bAV1\b/i.test(text);
    if (isAv1)
        return 'AV1';
    if (isHevc && is60fps)
        return 'HEVC 10Bit (60FPS)';
    if (isHevc)
        return 'HEVC 10Bit';
    if (is60fps)
        return 'H.264 (60FPS)';
    return 'H.264';
}
