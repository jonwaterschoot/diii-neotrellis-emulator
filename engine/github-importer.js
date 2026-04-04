/**
 * github-importer.js
 * Fetches a Lua script (+ optional README) from a public GitHub repository.
 *
 * Accepted input forms:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch
 *   github.com/owner/repo
 *   owner/repo
 *
 * Resolution order:
 *   1. Fetch manifest.json → lua_file, documentation_url
 *   2. Fetch README.md (or documentation_url from manifest)
 *   3. Fetch .lua: manifest lua_file → <repo>.lua → index.lua → GitHub API scan
 *   4. Try branch "main", fall back to "master" if any fetch 404s
 */

export class GitHubImporter {
  /**
   * Parse a GitHub URL or owner/repo string.
   * @param {string} input
   * @returns {{ owner: string, repo: string, branch: string } | null}
   */
  parseRepo(input) {
    input = (input || '').trim();

    // Full URL: github.com/owner/repo[/tree/branch]
    const urlMatch = input.match(/github\.com\/([^/\s]+)\/([^/?\s#]+)(?:\/tree\/([^/?\s#]+))?/);
    if (urlMatch) {
      return { owner: urlMatch[1], repo: urlMatch[2], branch: urlMatch[3] || null };
    }

    // Shorthand: owner/repo
    const shortMatch = input.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
    if (shortMatch) {
      return { owner: shortMatch[1], repo: shortMatch[2], branch: null };
    }

    return null;
  }

  rawUrl(owner, repo, branch, path) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  }

  async _fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  async _tryBranches(owner, repo, path, knownBranch) {
    const branches = knownBranch
      ? [knownBranch]
      : ['main', 'master'];

    for (const branch of branches) {
      try {
        const text = await this._fetchText(this.rawUrl(owner, repo, branch, path));
        return { text, branch };
      } catch { /* try next */ }
    }
    return null;
  }

  /**
   * Import a script from a GitHub repo URL or owner/repo string.
   * @param {string} input – URL or owner/repo
   * @param {function} onProgress – optional (message: string) => void
   * @returns {{ source, name, readme, repoUrl, branch }}
   */
  async import(input, onProgress = () => {}) {
    const parsed = this.parseRepo(input);
    if (!parsed) {
      throw new Error('Could not parse — use github.com/owner/repo or owner/repo');
    }

    const { owner, repo } = parsed;
    let branch = parsed.branch;

    onProgress(`Connecting to ${owner}/${repo}…`);

    // ── 1. Try manifest.json ──────────────────────────────────────────────────
    let manifest = null;
    let luaFile = null;
    let readmeUrl = null;

    const manifestResult = await this._tryBranches(owner, repo, 'manifest.json', branch);
    if (manifestResult) {
      branch = branch || manifestResult.branch;
      try {
        manifest = JSON.parse(manifestResult.text);
        luaFile = manifest.lua_file || null;
        readmeUrl = manifest.documentation_url || null;
        onProgress('Found manifest.json');
      } catch { manifest = null; }
    }

    // If we found a branch via manifest, lock it in; otherwise still unresolved
    // ── 2. Resolve README URL ─────────────────────────────────────────────────
    // Will be fetched after we lock in the branch via the .lua search

    // ── 3. Find and fetch .lua ────────────────────────────────────────────────
    const candidates = [];
    if (luaFile) candidates.push(luaFile);
    candidates.push(`${repo}.lua`, 'index.lua');

    let source = null;
    let name = null;

    for (const candidate of candidates) {
      onProgress(`Trying ${candidate}…`);
      const result = await this._tryBranches(owner, repo, candidate, branch);
      if (result) {
        source = result.text;
        name = candidate;
        branch = branch || result.branch;
        break;
      }
    }

    // Last resort: GitHub API directory listing
    if (!source) {
      onProgress('Scanning repository for .lua files…');
      try {
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/`;
        const res = await fetch(apiUrl);
        if (res.ok) {
          const files = await res.json();
          const luaEntry = Array.isArray(files) && files.find(f => f.name.endsWith('.lua'));
          if (luaEntry?.download_url) {
            source = await this._fetchText(luaEntry.download_url);
            name = luaEntry.name;
          }
        }
      } catch { /* give up */ }
    }

    if (!source) {
      throw new Error(`No .lua file found in ${owner}/${repo} — check the repo name and that it's public`);
    }

    // ── 4. Fetch README ───────────────────────────────────────────────────────
    let readme = null;
    const resolvedBranch = branch || 'main';

    const readmeFetchUrl = readmeUrl || this.rawUrl(owner, repo, resolvedBranch, 'README.md');
    onProgress('Fetching README…');
    try {
      readme = await this._fetchText(readmeFetchUrl);
    } catch { /* README is optional */ }

    return {
      source,
      name,
      readme,
      repoUrl: `https://github.com/${owner}/${repo}`,
      branch: resolvedBranch,
    };
  }
}
