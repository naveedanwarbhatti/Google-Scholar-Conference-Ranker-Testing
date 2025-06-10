// background.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Simple Jaro-Winkler implementation (no external deps)
export function jaroWinkler(a, b) {
    if (a === b)
        return 1;
    const maxDist = Math.floor(Math.max(a.length, b.length) / 2) - 1;
    const matchA = [];
    const matchB = [];
    let matches = 0;
    for (let i = 0; i < a.length; i++) {
        const start = Math.max(0, i - maxDist);
        const end = Math.min(i + maxDist + 1, b.length);
        for (let j = start; j < end; j++) {
            if (!matchB[j] && a[i] === b[j]) {
                matchA[i] = matchB[j] = true;
                matches++;
                break;
            }
        }
    }
    if (!matches)
        return 0;
    let t = 0;
    let k = 0;
    for (let i = 0; i < a.length; i++) {
        if (matchA[i]) {
            while (!matchB[k])
                k++;
            if (a[i] !== b[k])
                t++;
            k++;
        }
    }
    const m = matches;
    const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
    let l = 0;
    while (l < 4 && a[l] === b[l])
        l++;
    return jaro + l * 0.1 * (1 - jaro);
}
// --- Type Definitions ---
// Note: These are now read globally by the TS compiler, no imports needed.
// The official, recommended DBLP SPARQL endpoint
const DBLP_SPARQL_ENDPOINT = "https://sparql.dblp.org/sparql";
function sanitizeAuthorName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}
export function getScholarAuthorName(raw) {
    return sanitizeAuthorName(raw.split("(")[0]);
}
export function getScholarSamplePublications(titles, limit = 5) {
    return titles.slice(0, limit).map(t => sanitizeAuthorName(t));
}
export function extractPidFromDblpUrl(url) {
    const m = url.match(/\/pid\/([^/]+\/[^/.]+)/);
    return m ? m[1] : "";
}
export function searchDblpForAuthor(name) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const resp = yield fetch(`https://dblp.org/search/author/api?q=${encodeURIComponent(name)}&format=json`);
        if (!resp.ok)
            throw new Error("DBLP search failed");
        const data = yield resp.json();
        const hits = ((_b = (_a = data.result) === null || _a === void 0 ? void 0 : _a.hits) === null || _b === void 0 ? void 0 : _b.hit) || [];
        return hits.map((h) => {
            const info = h.info;
            const url = info.url;
            return { name: info.author, url, pid: extractPidFromDblpUrl(url) };
        });
    });
}
export function fetchPublicationsFromDblp(pid) {
    return __awaiter(this, void 0, void 0, function* () {
        const resp = yield fetch(`https://dblp.org/pid/${pid}.xml`);
        if (!resp.ok)
            return [];
        const xml = yield resp.text();
        return Array.from(xml.match(/<title>(.*?)<\/title>/g) || []).map(t => sanitizeAuthorName(t.replace(/<\/?title>/g, "")));
    });
}
export function selectBestDblpCandidateHeuristically(name, samplePubs, candidates) {
    return __awaiter(this, void 0, void 0, function* () {
        const sanitizedName = sanitizeAuthorName(name);
        let bestPid = null;
        let bestScore = 0;
        for (const cand of candidates) {
            const nameScore = jaroWinkler(sanitizedName, sanitizeAuthorName(cand.name));
            let matchCount = 0;
            if (samplePubs.length > 0) {
                const candPubs = yield fetchPublicationsFromDblp(cand.pid);
                matchCount = samplePubs.filter(t => candPubs.includes(t)).length;
            }
            const score = matchCount * 10 + nameScore;
            if (score > bestScore) {
                bestScore = score;
                bestPid = cand.pid;
            }
        }
        return bestPid;
    });
}
// --- SPARQL Query Execution ---
function executeSparqlQuery(query) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${DBLP_SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&output=json`;
        try {
            const response = yield fetch(url, { headers: { 'Accept': 'application/sparql-results+json' } });
            if (!response.ok)
                throw new Error(`HTTP error! status: ${response.status}`);
            return yield response.json();
        }
        catch (error) {
            console.error("SPARQL Query Error:", error);
            throw error;
        }
    });
}
// --- Main Logic Handler ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "processAuthor") {
        (() => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            try {
                const sampleTitles = getScholarSamplePublications(request.publicationTitles);
                const candidates = yield searchDblpForAuthor(request.authorName);
                const bestPid = yield selectBestDblpCandidateHeuristically(request.authorName, sampleTitles, candidates);
                if (!bestPid) {
                    sendResponse({ status: 'error', message: 'Could not verify a DBLP profile.' });
                    return;
                }
                const verifiedAuthorUri = `https://dblp.org/pid/${bestPid}`;
                // --- Proceed with the verified URI ---
                const totalCitationsQuery = `
          PREFIX dblp: <https://dblp.org/rdf/schema#>
          SELECT (COUNT(DISTINCT ?citing_paper) AS ?total_citations) WHERE {
            BIND(<${verifiedAuthorUri}> AS ?author_uri)
            ?authored_paper dblp:authoredBy ?author_uri .
            ?citing_paper dblp:cites ?authored_paper .
          }`;
                const selfCitationsQuery = `
          PREFIX dblp: <https://dblp.org/rdf/schema#>
          SELECT (COUNT(DISTINCT ?citing_paper) AS ?self_citations) WHERE {
            BIND(<${verifiedAuthorUri}> AS ?author_uri)
            ?authored_paper dblp:authoredBy ?author_uri .
            ?citing_paper dblp:cites ?authored_paper .
            ?citing_paper dblp:authoredBy ?author_uri .
          }`;
                const [totalResult, selfResult] = yield Promise.all([
                    executeSparqlQuery(totalCitationsQuery),
                    executeSparqlQuery(selfCitationsQuery)
                ]);
                const totalCitations = parseInt((_c = (_b = (_a = totalResult.results.bindings[0]) === null || _a === void 0 ? void 0 : _a.total_citations) === null || _b === void 0 ? void 0 : _b.value) !== null && _c !== void 0 ? _c : '0', 10);
                const selfCitations = parseInt((_f = (_e = (_d = selfResult.results.bindings[0]) === null || _d === void 0 ? void 0 : _d.self_citations) === null || _e === void 0 ? void 0 : _e.value) !== null && _f !== void 0 ? _f : '0', 10);
                const percentage = totalCitations === 0 ? 0 : (selfCitations / totalCitations) * 100;
                sendResponse({ status: 'success', selfCitations, totalCitations, percentage });
            }
            catch (error) {
                sendResponse({ status: 'error', message: `DBLP API Error: ${error.message}` });
            }
        }))();
        return true; // Indicate asynchronous response.
    }
});
