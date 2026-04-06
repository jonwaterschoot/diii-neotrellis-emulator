/**
 * script-importer.js
 * Fetches a Lua script (+ optional README) from a public Git repository.
 *
 * Supported hosts:
 *   GitHub   — github.com/owner/repo[/tree/branch]
 *   Codeberg — codeberg.org/owner/repo[/src/branch/branch]
 *
 * Also accepts bare shorthand:  owner/repo  (defaults to GitHub)
 *
 * Resolution order per host:
 *   1. Fetch manifest.json → lua_file, documentation_url
 *   2. Find .lua: manifest lua_file → <repo>.lua → index.lua → API scan
 *   3. Try branch "main", fall back to "master" if any fetch 404s
 *   4. Fetch README.md (or documentation_url from manifest)
 */

const HOSTS = {
  github: {
    raw: (owner, repo, branch, path) =>
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
    api: (owner, repo, subpath = '') =>
      `https://api.github.com/repos/${owner}/${repo}/contents/${subpath}`,
    repoUrl: (owner, repo) =>
      `https://github.com/${owner}/${repo}`,
  },
  codeberg: {
    raw: (owner, repo, branch, path) =>
      `https://codeberg.org/${owner}/${repo}/raw/branch/${branch}/${path}`,
    api: (owner, repo, subpath = '') =>
      `https://codeberg.org/api/v1/repos/${owner}/${repo}/contents/${subpath}`,
    repoUrl: (owner, repo) =>
      `https://codeberg.org/${owner}/${repo}`,
  },
};

export class ScriptImporter {
  /**
   * Parse a repo URL or owner/repo shorthand.
   * @param {string} input
   * @returns {{ host: string, owner: string, repo: string, branch: string|null } | null}
   */
  parseRepo(input) {
    input = (input || '').trim();

    // Codeberg: codeberg.org/owner/repo[/src/branch/<branch>[/subpath]]
    const cbMatch = input.match(
      /codeberg\.org\/([^/\s]+)\/([^/?\s#]+)(?:\/src\/branch\/([^/?\s#]+)(?:\/([^?\s#]+))?)?/
    );
    if (cbMatch) {
      return { host: 'codeberg', owner: cbMatch[1], repo: cbMatch[2],
               branch: cbMatch[3] || null, subpath: cbMatch[4] || '' };
    }

    // GitHub: github.com/owner/repo[/tree/<branch>[/subpath]]
    const ghMatch = input.match(
      /github\.com\/([^/\s]+)\/([^/?\s#]+)(?:\/tree\/([^/?\s#]+)(?:\/([^?\s#]+))?)?/
    );
    if (ghMatch) {
      return { host: 'github', owner: ghMatch[1], repo: ghMatch[2],
               branch: ghMatch[3] || null, subpath: ghMatch[4] || '' };
    }

    // Bare owner/repo — default to GitHub
    const shortMatch = input.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
    if (shortMatch) {
      return { host: 'github', owner: shortMatch[1], repo: shortMatch[2], branch: null, subpath: '' };
    }

    return null;
  }

  async _fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  async _tryBranches(rawFn, owner, repo, path, knownBranch) {
    const branches = knownBranch ? [knownBranch] : ['main', 'master'];
    for (const branch of branches) {
      try {
        const text = await this._fetchText(rawFn(owner, repo, branch, path));
        return { text, branch };
      } catch { /* try next */ }
    }
    return null;
  }

  /**
   * Import a script from a repo URL or owner/repo string.
   * @param {string} input
   * @param {function} onProgress – optional (message: string) => void
   * @returns {{ source, name, readme, repoUrl, branch, host }}
   */
  async import(input, onProgress = () => {}) {
    const parsed = this.parseRepo(input);
    if (!parsed) {
      throw new Error(
        'Could not parse — use github.com/owner/repo, codeberg.org/owner/repo, or owner/repo'
      );
    }

    const { host, owner, repo, subpath } = parsed;
    let branch = parsed.branch;
    const h = HOSTS[host];
    // Normalise subpath: no leading/trailing slashes, empty string if absent
    const dir = subpath ? subpath.replace(/\/$/, '') : '';
    const prefix = dir ? `${dir}/` : '';

    onProgress(`Connecting to ${host}:${owner}/${repo}${dir ? `/${dir}` : ''}…`);

    // ── 1. Try manifest.json ──────────────────────────────────────────────────
    let luaFile = null;
    let readmeUrl = null;

    const manifestResult = await this._tryBranches(h.raw, owner, repo, `${prefix}manifest.json`, branch);
    if (manifestResult) {
      branch = branch || manifestResult.branch;
      try {
        const manifest = JSON.parse(manifestResult.text);
        luaFile = manifest.lua_file || null;
        readmeUrl = manifest.documentation_url || null;
        onProgress('Found manifest.json');
      } catch { /* malformed manifest — ignore */ }
    }

    // ── 2. Find and fetch .lua ────────────────────────────────────────────────
    const candidates = [];
    if (luaFile) candidates.push(`${prefix}${luaFile}`);
    candidates.push(`${prefix}${repo}.lua`, `${prefix}index.lua`);

    let source = null;
    let name = null;

    for (const candidate of candidates) {
      onProgress(`Trying ${candidate}…`);
      const result = await this._tryBranches(h.raw, owner, repo, candidate, branch);
      if (result) {
        source = result.text;
        name = candidate.split('/').pop(); // filename only
        branch = branch || result.branch;
        break;
      }
    }

    // Last resort: API directory listing of the target dir
    if (!source) {
      onProgress('Scanning repository for .lua files…');
      try {
        const res = await fetch(h.api(owner, repo, dir));
        if (res.ok) {
          const files = await res.json();
          const entries = Array.isArray(files) ? files : (files.tree ?? []);
          const luaEntry = entries.find(f => (f.name ?? f.path ?? '').endsWith('.lua'));
          const downloadUrl = luaEntry?.download_url
            ?? (luaEntry?.path ? h.raw(owner, repo, branch || 'main', `${prefix}${luaEntry.path}`) : null);
          if (downloadUrl) {
            source = await this._fetchText(downloadUrl);
            name = (luaEntry.name ?? luaEntry.path ?? '').split('/').pop();
          }
        }
      } catch { /* give up */ }
    }

    if (!source) {
      throw new Error(
        `No .lua file found in ${owner}/${repo} — check the repo name and that it's public`
      );
    }

    // ── 3. Fetch README ───────────────────────────────────────────────────────
    let readme = null;
    const resolvedBranch = branch || 'main';
    // Prefer README in the same subdir, fall back to repo root
    const readmeFetchUrl = readmeUrl
      || h.raw(owner, repo, resolvedBranch, `${prefix}README.md`);
    onProgress('Fetching README…');
    try {
      readme = await this._fetchText(readmeFetchUrl);
    } catch {
      if (dir) {
        try { readme = await this._fetchText(h.raw(owner, repo, resolvedBranch, 'README.md')); }
        catch { /* optional */ }
      }
    }

    return {
      source,
      name,
      readme,
      repoUrl: h.repoUrl(owner, repo),
      branch: resolvedBranch,
      host,
    };
  }
}
