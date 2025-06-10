// background.ts

// Utility helpers shared with tests
import {
  jaroWinkler,
  sanitizeAuthorName,
  getScholarAuthorName,
  getScholarSamplePublications,
  extractPidFromDblpUrl,
} from "./src/utils";

// --- Type Definitions ---
// Note: These are now read globally by the TS compiler, no imports needed.

// The official, recommended DBLP SPARQL endpoint
const DBLP_SPARQL_ENDPOINT = "https://sparql.dblp.org/sparql";

// --- Type Definitions for SPARQL ---
interface SparqlBinding {
  [key: string]: { value: string; type: string; };
}
interface SparqlResponse {
  results: { bindings: SparqlBinding[]; };
}
interface AuthorMessage {
  action: "processAuthor";
  authorName: string;
  publicationTitles: string[];
}

interface DblpCandidate {
  name: string;
  url: string;
  pid: string;
}


export async function searchDblpForAuthor(name: string): Promise<DblpCandidate[]> {
  const resp = await fetch(`https://dblp.org/search/author/api?q=${encodeURIComponent(name)}&format=json`);
  if (!resp.ok) throw new Error("DBLP search failed");
  const data = await resp.json();
  const hits = data.result?.hits?.hit || [];
  return hits.map((h: any) => {
    const info = h.info;
    const url = info.url as string;
    return { name: info.author as string, url, pid: extractPidFromDblpUrl(url) };
  });
}

export async function fetchPublicationsFromDblp(pid: string): Promise<string[]> {
  const resp = await fetch(`https://dblp.org/pid/${pid}.xml`);
  if (!resp.ok) return [];
  const xml = await resp.text();
  return Array.from(xml.match(/<title>(.*?)<\/title>/g) || []).map(t => sanitizeAuthorName(t.replace(/<\/?title>/g, "")));
}

export async function selectBestDblpCandidateHeuristically(name: string, samplePubs: string[], candidates: DblpCandidate[]): Promise<string | null> {
  const sanitizedName = sanitizeAuthorName(name);
  let bestPid: string | null = null;
  let bestScore = 0;
  for (const cand of candidates) {
    const nameScore = jaroWinkler(sanitizedName, sanitizeAuthorName(cand.name));
    let matchCount = 0;
    if (samplePubs.length > 0) {
      const candPubs = await fetchPublicationsFromDblp(cand.pid);
      matchCount = samplePubs.filter(t => candPubs.includes(t)).length;
    }
    const score = matchCount * 10 + nameScore;
    if (score > bestScore) {
      bestScore = score;
      bestPid = cand.pid;
    }
  }
  return bestPid;
}

// --- SPARQL Query Execution ---
async function executeSparqlQuery(query: string): Promise<SparqlResponse> {
  const url = `${DBLP_SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&output=json`;
  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/sparql-results+json' } });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json() as SparqlResponse;
  } catch (error) {
    console.error("SPARQL Query Error:", error);
    throw error;
  }
}

// --- Main Logic Handler ---
chrome.runtime.onMessage.addListener((request: AuthorMessage, sender, sendResponse: (response: ApiResponse) => void) => {
  if (request.action === "processAuthor") {
    (async () => {
      try {
        const sampleTitles = getScholarSamplePublications(request.publicationTitles);
        const candidates = await searchDblpForAuthor(request.authorName);
        const bestPid = await selectBestDblpCandidateHeuristically(request.authorName, sampleTitles, candidates);

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

        const [totalResult, selfResult] = await Promise.all([
          executeSparqlQuery(totalCitationsQuery),
          executeSparqlQuery(selfCitationsQuery)
        ]);

        const totalCitations = parseInt(totalResult.results.bindings[0]?.total_citations?.value ?? '0', 10);
        const selfCitations = parseInt(selfResult.results.bindings[0]?.self_citations?.value ?? '0', 10);
        const percentage = totalCitations === 0 ? 0 : (selfCitations / totalCitations) * 100;
        
        sendResponse({ status: 'success', selfCitations, totalCitations, percentage });

      } catch (error: any) {
        sendResponse({ status: 'error', message: `DBLP API Error: ${error.message}` });
      }
    })();
    return true; // Indicate asynchronous response.
  }
});