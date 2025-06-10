"use strict";
// background.ts – improved DBLP profile detection and self‑citation analysis
// ===============================================================
// This file completely replaces the previous background script.  It
// 1) finds the most likely DBLP author profile for a Google Scholar
//    page using a heuristic match that compares publication titles,
// 2) counts total and self citations with SPARQL once the profile is
//    verified, and
// 3) responds back to the content‑script with a concise payload.
// -----------------------------------------------------------------
//  © 2025 – MIT License
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// --- External End‑Points -----------------------------------------
const DBLP_API_AUTHOR_SEARCH_URL = "https://dblp.org/search/author/api";
const DBLP_SPARQL_ENDPOINT = "https://sparql.dblp.org/sparql";
// --- Heuristic Constants -----------------------------------------
const DBLP_SEARCH_MAX_HITS = 10; // hit list size from API
const DBLP_HEURISTIC_MIN_OVERLAP_COUNT = 3; // ≥ this many title overlaps → accept
const DBLP_HEURISTIC_MIN_NAME_SIMILARITY = 0.65; // Jaro–Winkler lower‑bound
// -----------------------------------------------------------------
// Utility helpers
// -----------------------------------------------------------------
/** Very small Jaro‑Winkler implementation – sufficient for name matching. */
function jaroWinkler(a, b) {
    if (a === b)
        return 1;
    const m = match(a, b);
    if (m === 0)
        return 0;
    const t = transpositions(a, b, m) / 2;
    const jw = (m / a.length + m / b.length + (m - t) / m) / 3;
    // prefix scale p = 0.1, max 4 chars
    let l = 0;
    while (l < 4 && a[l] === b[l])
        l++;
    return jw + l * 0.1 * (1 - jw);
    // -------------------- helpers -------------------------------
    function match(s, t) {
        const range = Math.max(s.length, t.length) / 2 - 1;
        const flagsS = new Array(s.length).fill(false);
        const flagsT = new Array(t.length).fill(false);
        let matches = 0;
        for (let i = 0; i < s.length; i++) {
            const start = Math.max(0, i - range);
            const end = Math.min(i + range + 1, t.length);
            for (let j = start; j < end; j++) {
                if (!flagsT[j] && s[i] === t[j]) {
                    flagsS[i] = flagsT[j] = true;
                    matches++;
                    break;
                }
            }
        }
        return matches;
    }
    function transpositions(s, t, m) {
        const range = Math.max(s.length, t.length) / 2 - 1;
        const flagsS = new Array(s.length).fill(false);
        const flagsT = new Array(t.length).fill(false);
        // first pass – collect matches in order for both strings
        const ms = [];
        const mt = [];
        for (let i = 0; i < s.length; i++) {
            const start = Math.max(0, i - range);
            const end = Math.min(i + range + 1, t.length);
            for (let j = start; j < end; j++) {
                if (!flagsT[j] && s[i] === t[j]) {
                    flagsS[i] = flagsT[j] = true;
                    ms.push(s[i]);
                    mt.push(t[j]);
                    break;
                }
            }
        }
        // second pass – compare match lists
        let trans = 0;
        for (let k = 0; k < ms.length; k++)
            if (ms[k] !== mt[k])
                trans++;
        return trans;
    }
}
function normalizeTitle(t) {
    return t.toLowerCase()
        .replace(/[^a-z0-9]/g, " ") // keep letters & digits
        .replace(/\s+/g, " ")
        .trim();
}
function extractPidFromDblpUrl(url) {
    const m1 = url.match(/dblp\.org\/pers\/hd\/[a-z0-9]\/([^.]+)/i);
    if (m1 === null || m1 === void 0 ? void 0 : m1[1])
        return m1[1].replace(/=/g, "");
    const m2 = url.match(/dblp\.org\/pid\/([^\/]+\/[^.]+)/i);
    if (m2 === null || m2 === void 0 ? void 0 : m2[1])
        return m2[1];
    const m3 = url.match(/dblp\.org\/pid\/([\w/-]+)\.html/i);
    if (m3 === null || m3 === void 0 ? void 0 : m3[1])
        return m3[1];
    return null;
}
function pidToAuthorUri(pid) {
    return `https://dblp.org/pid/${pid}`;
}
// -----------------------------------------------------------------
// 1. Search DBLP Author API and return a list of candidate <pid, name>
// -----------------------------------------------------------------
function searchDblpForAuthor(authorName) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const q = new URL(DBLP_API_AUTHOR_SEARCH_URL);
        q.searchParams.set("q", authorName);
        q.searchParams.set("h", DBLP_SEARCH_MAX_HITS.toString()); // hits
        q.searchParams.set("c", "3"); // compact json
        q.searchParams.set("format", "json");
        const res = yield fetch(q.toString());
        if (!res.ok)
            return [];
        const data = yield res.json();
        const arr = (_a = data.result.hits) === null || _a === void 0 ? void 0 : _a.hit;
        const hits = Array.isArray(arr) ? arr : arr ? [arr] : [];
        return hits.flatMap((h) => {
            var _a, _b;
            const url = (_a = h === null || h === void 0 ? void 0 : h.info) === null || _a === void 0 ? void 0 : _a.url;
            const name = (_b = h === null || h === void 0 ? void 0 : h.info) === null || _b === void 0 ? void 0 : _b.author;
            const pid = url ? extractPidFromDblpUrl(url) : null;
            return pid && name ? [{ pid, name }] : [];
        });
    });
}
// -----------------------------------------------------------------
// 2. Fetch up to N publication titles for a given author URI via SPARQL
// -----------------------------------------------------------------
function fetchTitlesForAuthor(authorUri_1) {
    return __awaiter(this, arguments, void 0, function* (authorUri, limit = 250) {
        const query = `PREFIX dblp: <https://dblp.org/rdf/schema#>
SELECT ?title WHERE {
  <${authorUri}> dblp:authored ?paper .
  ?paper dblp:title ?title .
} LIMIT ${limit}`;
        const url = `${DBLP_SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&output=json`;
        const rsp = yield fetch(url, { headers: { "Accept": "application/sparql-results+json" } });
        if (!rsp.ok)
            return [];
        const json = yield rsp.json();
        return json.results.bindings.map(b => normalizeTitle(b.title.value));
    });
}
// -----------------------------------------------------------------
// 3. Heuristic selection of best candidate profile
// -----------------------------------------------------------------
function identifyBestAuthorUri(authorName, scholarTitles) {
    return __awaiter(this, void 0, void 0, function* () {
        const candidates = yield searchDblpForAuthor(authorName);
        if (candidates.length === 0)
            return null;
        const scholNorm = scholarTitles.map(normalizeTitle);
        let bestUri = null;
        let bestScore = 0;
        for (const cand of candidates) {
            const nameSim = jaroWinkler(authorName.toLowerCase(), cand.name.toLowerCase());
            if (nameSim < DBLP_HEURISTIC_MIN_NAME_SIMILARITY)
                continue;
            const uri = pidToAuthorUri(cand.pid);
            const dblpTitles = yield fetchTitlesForAuthor(uri);
            const overlap = scholNorm.filter(st => dblpTitles.includes(st)).length;
            if (overlap < DBLP_HEURISTIC_MIN_OVERLAP_COUNT)
                continue;
            const score = overlap + nameSim * 2; // simple linear combo
            if (score > bestScore) {
                bestScore = score;
                bestUri = uri;
            }
        }
        return bestUri;
    });
}
// -----------------------------------------------------------------
// 4. SPARQL helper to count total / self citations once profile is verified
// -----------------------------------------------------------------
function countCitations(authorUri) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const totalQ = `PREFIX dblp: <https://dblp.org/rdf/schema#>
SELECT (COUNT(DISTINCT ?citing) AS ?total) WHERE {
  ?paper dblp:authoredBy <${authorUri}> .
  ?citing dblp:cites ?paper .
}`;
        const selfQ = `PREFIX dblp: <https://dblp.org/rdf/schema#>
SELECT (COUNT(DISTINCT ?citing) AS ?self) WHERE {
  ?paper dblp:authoredBy <${authorUri}> .
  ?citing dblp:cites ?paper .
  ?citing dblp:authoredBy <${authorUri}> .
}`;
        const [totalR, selfR] = yield Promise.all([
            executeSparqlQuery(totalQ),
            executeSparqlQuery(selfQ)
        ]);
        const total = parseInt((_c = (_b = (_a = totalR.results.bindings[0]) === null || _a === void 0 ? void 0 : _a.total) === null || _b === void 0 ? void 0 : _b.value) !== null && _c !== void 0 ? _c : "0", 10);
        const self = parseInt((_f = (_e = (_d = selfR.results.bindings[0]) === null || _d === void 0 ? void 0 : _d.self) === null || _e === void 0 ? void 0 : _e.value) !== null && _f !== void 0 ? _f : "0", 10);
        return { total, self, pct: total === 0 ? 0 : (self / total) * 100 };
    });
}
// -----------------------------------------------------------------
// 5. Generic SPARQL executor (unmodified from prior version)
// -----------------------------------------------------------------
function executeSparqlQuery(query) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${DBLP_SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&output=json`;
        const res = yield fetch(url, { headers: { "Accept": "application/sparql-results+json" } });
        if (!res.ok)
            throw new Error(`SPARQL HTTP ${res.status}`);
        return res.json();
    });
}
// -----------------------------------------------------------------
// 6. Main message listener – single entry point for content‑script
// -----------------------------------------------------------------
chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    if (req.action !== "processAuthor")
        return;
    (() => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const authorUri = yield identifyBestAuthorUri(req.authorName, req.publicationTitles);
            if (!authorUri) {
                sendResponse({ status: "error", message: "Could not confidently match author on DBLP." });
                return;
            }
            const { total, self, pct } = yield countCitations(authorUri);
            sendResponse({ status: "success", totalCitations: total, selfCitations: self, percentage: pct });
        }
        catch (err) {
            sendResponse({ status: "error", message: (_a = err.message) !== null && _a !== void 0 ? _a : String(err) });
        }
    }))();
    return true; // keep port alive for async reply
});
