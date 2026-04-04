/**
 * lua-minifier.js
 * Strips comments and blank lines from Lua source for device deployment.
 *
 * Ported from scripts/minify_og.py — identical stripping logic plus Lua 5.1
 * compatibility checks (the Pico runs Lua 5.1, not 5.3/5.4).
 *
 * Usage:
 *   import { LuaMinifier } from './engine/lua-minifier.js';
 *   const { output, warnings } = new LuaMinifier().minify(source);
 */

export class LuaMinifier {
  /**
   * Minify a Lua source string.
   * @param {string} source – full Lua file content
   * @returns {{ output: string, warnings: string[] }}
   *   output   – minified source ready for device deployment
   *   warnings – list of Lua 5.1 incompatibility messages (line + description)
   */
  minify(source) {
    const lines = source.split('\n');
    const out = [];

    for (const line of lines) {
      const stripped = line.replace(/\r$/, '');

      // Skip full-line comments (including LDoc --- and control map --)
      if (/^\s*--/.test(stripped)) continue;

      // Skip blank lines
      if (stripped.trim() === '') continue;

      // Strip inline comments (respecting string literals)
      const result = this._stripInlineComment(stripped);
      if (result.trim()) out.push(result);
    }

    const output = out.join('\n') + '\n';
    const warnings = this._checkLua51(out);

    return { output, warnings };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _stripInlineComment(line) {
    let result = '';
    let i = 0;
    let inStr = null;

    while (i < line.length) {
      const c = line[i];
      if (inStr) {
        result += c;
        if (c === inStr) inStr = null;
      } else if (c === '"' || c === "'") {
        inStr = c;
        result += c;
      } else if (c === '-' && line[i + 1] === '-') {
        break; // rest of line is a comment
      } else {
        result += c;
      }
      i++;
    }

    return result.trimEnd();
  }

  _checkLua51(lines) {
    const patterns = [
      { re: /(?<![=~<>])(>>|<<)(?!=)/, desc: 'bitwise shift (>> or <<) — not valid in Lua 5.1' },
      { re: /(?<![=~<>!])&(?![=&])/,   desc: 'bitwise AND (&) — not valid in Lua 5.1' },
      { re: /(?<![=~<>!])\|(?![=|])/,  desc: 'bitwise OR (|) — not valid in Lua 5.1' },
      { re: /~(?!=)/,                   desc: 'bitwise NOT/XOR (~) — not valid in Lua 5.1' },
      { re: /\bgoto\b/,                 desc: 'goto statement — not valid in Lua 5.1' },
      { re: /::/,                       desc: 'goto label (::) — not valid in Lua 5.1' },
    ];

    const warnings = [];
    lines.forEach((line, idx) => {
      for (const { re, desc } of patterns) {
        if (re.test(line)) {
          warnings.push(`Line ${idx + 1}: ${desc}`);
          break; // one warning per line
        }
      }
    });
    return warnings;
  }
}
