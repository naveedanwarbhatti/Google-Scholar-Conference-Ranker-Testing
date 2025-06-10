// background.ts

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
        // --- CHANGE 1: Make the search query flexible and case-insensitive ---
        const authorSearchQuery = `
          PREFIX dblp: <https://dblp.org/rdf/schema#>
          SELECT ?author_uri ?author_name
          WHERE {
            ?author_uri a dblp:Person .
            ?author_uri dblp:primaryFullPersonName ?author_name .
            FILTER(CONTAINS(LCASE(?author_name), LCASE("${request.authorName}")))
          }`;
        
        const authorResults = await executeSparqlQuery(authorSearchQuery);
        const potentialProfiles = authorResults.results.bindings;

        if (potentialProfiles.length === 0) {
          sendResponse({ status: 'error', message: 'DBLP profile not found.' });
          return;
        }

        // --- CHANGE 2: Restore the verification loop to find the correct profile ---
        let verifiedAuthorUri: string | null = null;
        for (const profile of potentialProfiles) {
          const dblpAuthorUri = profile.author_uri.value;
          const publicationsQuery = `
            PREFIX dblp: <https://dblp.org/rdf/schema#>
            SELECT ?title
            WHERE {
              <${dblpAuthorUri}> dblp:authored ?paper .
              ?paper dblp:title ?title .
            } LIMIT 100`; // Limit to first 100 publications for performance

          const publicationsResult = await executeSparqlQuery(publicationsQuery);
          const dblpTitles = publicationsResult.results.bindings.map(p => p.title.value.toLowerCase().trim());
          const scholarTitles = request.publicationTitles.map(t => t.toLowerCase().trim());

          // Count how many of the top Google Scholar titles appear in the DBLP publication list
          const matchCount = scholarTitles.filter(scholarTitle =>
            dblpTitles.some(dblpTitle => dblpTitle === scholarTitle)
          ).length;

          if (matchCount >= 3) { // Verification threshold from your project spec
            verifiedAuthorUri = dblpAuthorUri;
            break; // Found a verified match, stop searching.
          }
        }

        if (!verifiedAuthorUri) {
          sendResponse({ status: 'error', message: 'Could not verify a DBLP profile. (Found profiles, but publication match failed)' });
          return;
        }

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