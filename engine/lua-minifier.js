/**
 * lua-minifier.js
 * Strips comments and blank lines from Lua source for device deployment.
 *
 * Ported from scripts/minify_og.py — identical stripping logic, plus a check for code
 * that runs in the emulator (Fengari, Lua 5.3) but won't load on the device (Lua 5.5).
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
   *   warnings – code that won't load on the device (source line + description)
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
    const warnings = this._checkDevice(source);

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

  /**
   * Lua 5.5 makes for-loop variables read-only, so `for i = 1, 8 do i = i + 1 end` is a
   * compile error on the device, while Lua 5.3 in the emulator runs it. Finds those
   * assignments by following blocks, loop variables and locals that shadow them.
   * It's a scan, not a full parser: it can miss cases (e.g. `a, i = 1, 2`), but it
   * shouldn't flag valid code.
   * @param {string} source
   * @returns {string[]} warnings with source line numbers
   */
  _checkDevice(source) {
    const TOKEN = /--\[(=*)\[[\s\S]*?\]\1\]|--[^\n]*|\[(=*)\[[\s\S]*?\]\2\]|"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|[A-Za-z_]\w*|==|~=|<=|>=|\.\.\.?|::|\n|[^\s\w]/g;
    const KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto',
      'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);

    // Tokens with line numbers; comments and strings only count their newlines
    const tokens = [];
    let line = 1;
    for (const m of source.matchAll(TOKEN)) {
      const t = m[0];
      if (t === '\n') { line++; continue; }
      if (t.startsWith('--') || t[0] === '"' || t[0] === "'" || /^\[=*\[/.test(t)) {
        line += (t.match(/\n/g) || []).length;
        if (t[0] === '"' || t[0] === "'" || t[0] === '[') tokens.push({ t: '<str>', line });
        continue;
      }
      tokens.push({ t, line });
    }

    // Block stack: { loopVars: Set|null, locals: Set }
    const stack = [{ loopVars: null, locals: new Set() }];
    const isLoopVar = (name) => {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].locals.has(name)) return false; // a local (or parameter) shadows it
        if (stack[i].loopVars && stack[i].loopVars.has(name)) return true;
      }
      return false;
    };
    const warnings = [];
    let pendingLoopVars = null; // names from a for header, waiting for its `do`
    let braces = 0;             // inside a table constructor `i = 1` is a field, not an assignment

    for (let k = 0; k < tokens.length; k++) {
      const { t, line: ln } = tokens[k];
      const prev = tokens[k - 1]?.t;
      const next = tokens[k + 1]?.t;
      if (t === '{') { braces++; continue; }
      if (t === '}') { braces = Math.max(0, braces - 1); continue; }

      if (t === 'for') {
        pendingLoopVars = new Set();
        for (let j = k + 1; j < tokens.length && tokens[j].t !== '=' && tokens[j].t !== 'in'; j++) {
          if (/^[A-Za-z_]\w*$/.test(tokens[j].t)) pendingLoopVars.add(tokens[j].t);
        }
        continue;
      }
      if (t === 'do') {
        stack.push({ loopVars: pendingLoopVars, locals: new Set() });
        pendingLoopVars = null;
        continue;
      }
      if (t === 'function') {
        const block = { loopVars: null, locals: new Set() };
        // parameters shadow outer names
        let j = k + 1;
        while (j < tokens.length && tokens[j].t !== '(') j++;
        for (j++; j < tokens.length && tokens[j].t !== ')'; j++) {
          if (/^[A-Za-z_]\w*$/.test(tokens[j].t)) block.locals.add(tokens[j].t);
        }
        stack.push(block);
        continue;
      }
      if (t === 'if' || t === 'repeat') { stack.push({ loopVars: null, locals: new Set() }); continue; }
      if (t === 'end' || t === 'until') { if (stack.length > 1) stack.pop(); continue; }
      if (t === 'local') {
        // `local a, b` / `local function f`: names declared in this block
        const top = stack[stack.length - 1];
        for (let j = k + 1; j < tokens.length; j++) {
          const n = tokens[j].t;
          if (n === 'function') continue;
          if (!/^[A-Za-z_]\w*$/.test(n) || KEYWORDS.has(n)) break;
          top.locals.add(n);
          if (tokens[j + 1]?.t === '<') j += 3; // attribs: <const> / <close>
          if (tokens[j + 1]?.t !== ',') break;
          j++;
        }
        continue;
      }

      // `name = …` (not `==`, not a field `.name =` or `{ name = }`, not `local name =`)
      if (/^[A-Za-z_]\w*$/.test(t) && !KEYWORDS.has(t) && next === '=' && braces === 0 &&
          prev !== '.' && prev !== ':' && prev !== 'local' && prev !== ',' && prev !== 'for' && isLoopVar(t)) {
        warnings.push(`Line ${ln}: assigns to for-loop variable '${t}', which is read-only in Lua 5.5 (the device) — use a local copy`);
      }
    }
    return warnings;
  }
}
