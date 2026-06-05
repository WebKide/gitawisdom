// searchController.js
import { GitaSearch } from './search.js';

// --- Initialize search module with JSON ---
const gitaSearch = new GitaSearch(window.gitaJSON); // assume JSON loaded globally

// --- DOM elements (replace IDs/classes with your actual card elements) ---
const searchCard = document.getElementById('search-card');
const searchInput = document.getElementById('search-term');
const verseBtn = document.getElementById('search-verse-btn');
const purportBtn = document.getElementById('search-purport-btn');
const resultsContainer = document.getElementById('search-results');
const nextPageBtn = document.getElementById('search-next-page');
const backToResultsBtn = document.getElementById('back-to-results');

// --- Open search card ---
export function openSearchCard() {
  searchCard.style.display = 'block';
  resultsContainer.innerHTML = ''; // clear previous results
  searchInput.value = '';
  gitaSearch.reset();
}

// --- Render search results ---
function renderResults(results) {
  resultsContainer.innerHTML = '';
  if (results.length === 0) {
    resultsContainer.innerHTML = '<p>No results found.</p>';
    return;
  }

  results.forEach(r => {
    const btn = document.createElement('button');
    btn.className = 'search-result-btn';
    btn.innerHTML = `Chapter ${r.chapter} — ${r.id} — ${r.snippet}`;
    btn.onclick = () => showVerse(r.id);
    resultsContainer.appendChild(btn);
  });

  // Show Next Page button if more results
  nextPageBtn.style.display = (gitaSearch.currentPage + 1) * gitaSearch.pageSize < gitaSearch.currentResults.length
    ? 'inline-block'
    : 'none';

  backToResultsBtn.style.display = 'none'; // hide verse view back button
}

// --- Show full verse/purport by ID ---
function showVerse(id) {
  const v = gitaSearch.getVerse(id);
  if (!v) return;

  resultsContainer.innerHTML = `
    <h3>Chapter ${v.chapter} — ${v.id}</h3>
    <p><strong>Verse:</strong><br>${v.text}</p>
    <p><strong>Purport:</strong><br>${v.purport}</p>
  `;

  backToResultsBtn.style.display = 'inline-block'; // show back button
  nextPageBtn.style.display = 'none'; // hide next page when viewing a verse
}

// --- Search handler ---
function handleSearch(mode) {
  const term = searchInput.value.trim();
  if (!term) return;

  const results = gitaSearch.search(term, mode);
  renderResults(results);
}

// --- Next page handler ---
function handleNextPage() {
  const results = gitaSearch.nextPage();
  renderResults(results);
}

// --- Back to results from verse ---
function handleBackToResults() {
  renderResults(gitaSearch.paginate());
}

// --- Event listeners ---
verseBtn.addEventListener('click', () => handleSearch('verse'));
purportBtn.addEventListener('click', () => handleSearch('purport'));
nextPageBtn.addEventListener('click', handleNextPage);
backToResultsBtn.addEventListener('click', handleBackToResults);