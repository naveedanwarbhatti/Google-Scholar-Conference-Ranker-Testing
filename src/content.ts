// content.ts - Self-Citation Checker
import { fetchSelfCitationStats, SelfCitationStats } from './dblpSelfCitation';

function sanitizeAuthorName(name: string): string {
  let cleaned = name.trim();
  const patterns = [
    /[,\s]+ph\.d\.?$/i,
    /[,\s]+phd$/i,
    /[,\s]+dr\.?$/i,
    /[,\s]+prof\.?$/i,
    /[,\s]+professor$/i,
  ];
  for (const p of patterns) cleaned = cleaned.replace(p, '');
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned.trim();
}

function extractPidFromDblpUrl(url: string): string | null {
  const m = url.match(/dblp\.org\/pid\/([\w/]+)\.html/i);
  return m ? m[1] : null;
}

async function searchDblp(author: string): Promise<string | null> {
  const q = new URL('https://dblp.org/search/author/api');
  q.searchParams.set('q', author);
  q.searchParams.set('format', 'json');
  try {
    const resp = await fetch(q.toString());
    const json = await resp.json();
    const hit = json?.result?.hits?.hit;
    if (!hit) return null;
    const first = Array.isArray(hit) ? hit[0] : hit;
    return extractPidFromDblpUrl(first?.info?.url ?? '') ?? null;
  } catch (err) {
    console.warn('DBLP search failed', err);
    return null;
  }
}

function getCachedStats(pid: string): SelfCitationStats | null {
  const raw = localStorage.getItem(`self-citation-${pid}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SelfCitationStats;
  } catch {
    return null;
  }
}

function setCachedStats(pid: string, stats: SelfCitationStats) {
  localStorage.setItem(`self-citation-${pid}`, JSON.stringify(stats));
}

async function loadStats(pid: string, force = false): Promise<SelfCitationStats> {
  if (!force) {
    const cached = getCachedStats(pid);
    if (cached) return cached;
  }
  const stats = await fetchSelfCitationStats(pid);
  setCachedStats(pid, stats);
  return stats;
}

function insertPanel(text: string, onRefresh: () => void) {
  let panel = document.getElementById('self-citation-panel') as HTMLDivElement | null;
  if (panel) panel.remove();
  panel = document.createElement('div');
  panel.id = 'self-citation-panel';
  panel.style.border = '1px solid #ccc';
  panel.style.padding = '6px';
  panel.style.marginBottom = '10px';
  panel.style.background = '#f7f7f7';

  const span = document.createElement('span');
  span.textContent = text;
  const button = document.createElement('button');
  button.textContent = 'Refresh';
  button.style.marginLeft = '8px';
  button.addEventListener('click', onRefresh);

  panel.appendChild(span);
  panel.appendChild(button);

  const container = document.querySelector('#gsc_prf');
  if (container) {
    container.prepend(panel);
  } else {
    document.body.prepend(panel);
  }
}

async function main() {
  const nameEl = document.getElementById('gsc_prf_in');
  if (!nameEl) return;
  const rawName = nameEl.textContent || '';
  const cleanName = sanitizeAuthorName(rawName);
  const pid = await searchDblp(cleanName);
  if (!pid) {
    insertPanel('DBLP author not found', () => {});
    return;
  }
  async function display(force = false) {
    insertPanel('Loading...', () => display(true));
    const stats = await loadStats(pid!, force);
    const percent = (stats.rate * 100).toFixed(1);
    insertPanel(`Self-citation rate: ${percent}% (${stats.self}/${stats.total})`, () => display(true));
  }

  display();
}

main().catch(err => console.error('self-citation checker error', err));
