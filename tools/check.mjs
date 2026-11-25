#!/usr/bin/env node
// Fast checks that need no browser and no dependencies:
//
//   node tools/check.mjs            everything (about a second)
//   node tools/check.mjs imports    one group: syntax | imports | names | text | dom | gallery | save | layout | climb | grove
//   node tools/check.mjs layout 500 layouts for 500 synthetic islands (default 150)
//
// Run it after every change. It catches the mistakes that otherwise only show
// up as a blank page: a syntax error, an import of a name the other module
// doesn't export, a helper left behind when code moved to another file, a
// text key or element id that doesn't exist, a save that no longer migrates,
// and an ashore layout that fails its own validation.
//
// The source is read with regular expressions, not a parser. `imports` and
// `names` rely on the house style: one-line `import { … } from '…';` and
// top-level declarations starting in column 0.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const GALLERY = join(SRC, 'gallery') + sep; // the look-dev gallery: its own page, gallery.html
const rel = (f) => relative(ROOT, f);
const load = (f) => import(pathToFileURL(join(SRC, f)).href);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []);
}
const files = walk(SRC);
const source = Object.fromEntries(files.map((f) => [f, readFileSync(f, 'utf8')]));
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// ------------------------------------------------------------------ parsing
const IDENT = '[A-Za-z_$][\\w$]*';
/** A name, escaped for use inside a RegExp. */
const lit = (name) => name.replace(/[$]/g, '\\$&');
/** Matches `name` as a whole identifier that is not a property access (`x.name`). */
const NOT_MEMBER = '(?<![\\w$])(?<!(?<!\\.)\\.)'; // not `x.name`, but `...name` is fine
const word = (name, flags = 'g') => new RegExp(NOT_MEMBER + lit(name) + '(?![\\w$])', flags);

/** Template literals with their text blanked, keeping the code inside ${…}. */
function bareTemplates(text) {
  let out = '';
  const stack = []; // 'T' = inside template text; a number = brace depth inside ${…}
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], top = stack[stack.length - 1];
    if (top === 'T') {
      if (ch === '\\') { out += '  '; i++; }
      else if (ch === '`') { stack.pop(); out += ch; }
      else if (ch === '$' && text[i + 1] === '{') { stack.push(0); out += '${'; i++; }
      else out += ch === '\n' ? ch : ' ';
    } else {
      if (ch === '`') stack.push('T');
      else if (typeof top === 'number' && ch === '{') stack[stack.length - 1]++;
      else if (typeof top === 'number' && ch === '}') { if (top === 0) stack.pop(); else stack[stack.length - 1]--; }
      out += ch;
    }
  }
  return out;
}

/** Source with comments and the contents of strings blanked (line numbers kept). */
function bare(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return bareTemplates(text)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, (m) => m[0] + ' '.repeat(m.length - 2) + m[0])
    .replace(/(^|[^:\\])\/\/.*$/gm, (m, before) => before + ' '.repeat(m.length - before.length));
}

/** Names declared at the top level of a module (column 0). */
function topLevel(text) {
  const names = new Set();
  const decl = new RegExp('^(?:export\\s+)?(?:async\\s+)?(?:function\\*?|class|const|let|var)\\s+(' + IDENT + ')', 'gm');
  for (const m of text.matchAll(decl)) names.add(m[1]);
  // one-line `const A = 1, B = 2;` declares several names
  for (const m of text.matchAll(/^(?:export\s+)?(?:const|let|var)\s+(.*);[ \t]*(?:\/\/.*)?$/gm)) {
    let depth = 0, flat = '';
    for (const ch of bare(m[1]).replace(/`[^`]*`/g, '0')) {
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      else if (depth === 0) flat += ch;
    }
    for (const d of flat.split(',')) {
      const name = d.match(new RegExp('^\\s*(' + IDENT + ')\\s*='))?.[1];
      if (name) names.add(name);
    }
  }
  return names;
}

/** Names a module exports (declarations, `export { a, b as c }`, default). */
function exportsOf(text) {
  const names = new Set();
  for (const line of text.split('\n')) {
    if (!line.startsWith('export')) continue;
    for (const n of topLevel(line)) names.add(n);
  }
  for (const m of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  if (/^export\s+default\b/m.test(text)) names.add('default');
  return names;
}

/** Every static import in a module: { spec, names: [{ name, local }], index }. */
function importsOf(text) {
  const out = [];
  for (const m of text.matchAll(/^import\s+([^;]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
    const clause = m[1], names = [];
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const [name, local] = part.trim().split(/\s+as\s+/);
        if (name) names.push({ name, local: local || name });
      }
    }
    const star = clause.match(/\*\s+as\s+([\w$]+)/)?.[1];
    if (star) names.push({ name: '*', local: star });
    const def = clause.replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+[\w$]+/, '').replace(/,/g, '').trim();
    if (def) names.push({ name: 'default', local: def });
    out.push({ spec: m[2], names, index: m.index });
  }
  return out;
}

// ------------------------------------------------------------------- checks
const checks = {
  syntax() {
    const errors = [];
    for (const f of files) {
      try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
      catch (e) { errors.push(String(e.stderr).trim().split('\n').slice(0, 4).join('\n')); }
    }
    return { errors, note: `${files.length} files` };
  },

  // Relative imports resolve, every imported name is exported by its target,
  // and every imported name is used.
  imports() {
    const errors = [];
    let count = 0;
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const mapped = Object.keys(JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports);
    for (const f of files) {
      const code = bare(source[f]);
      for (const imp of importsOf(source[f])) {
        const at = `${rel(f)}:${lineOf(source[f], imp.index)}`;
        for (const { local } of imp.names) {
          if (code.match(word(local)).length < 2) errors.push(`${at}: '${local}' is imported but never used`);
        }
        if (!imp.spec.startsWith('.')) {
          if (!mapped.some((b) => imp.spec === b || (b.endsWith('/') && imp.spec.startsWith(b)))) errors.push(`${at}: '${imp.spec}' is not in index.html's import map`);
          continue;
        }
        const target = resolve(dirname(f), imp.spec);
        if (!existsSync(target)) { errors.push(`${at}: ${imp.spec} does not exist`); continue; }
        const exported = exportsOf(source[target] ?? readFileSync(target, 'utf8'));
        for (const { name } of imp.names) {
          count++;
          if (name !== '*' && !exported.has(name)) errors.push(`${at}: ${rel(target)} does not export '${name}'`);
        }
      }
    }
    return { errors, note: `${count} imported names` };
  },

  // A module-level name from elsewhere in the project that is used here but
  // neither imported nor declared: what gets left behind when code moves files.
  names() {
    const errors = [];
    const own = (f) => new Set([...topLevel(source[f]), ...importsOf(source[f]).flatMap((i) => i.names.map((n) => n.local))]);
    const known = new Set(files.flatMap((f) => [...own(f)]));
    let count = 0;
    for (const f of files) {
      const code = bare(source[f]);
      const mine = own(f);
      for (const name of known) {
        if (mine.has(name) || name.length < 3) continue;
        const n = lit(name);
        // used as a value: not `x.name`, not an object key `name:`
        const use = new RegExp(NOT_MEMBER + n + '(?![\\w$]|\\s*:)').exec(code);
        if (!use) continue;
        count++;
        // …and not a local of some kind: declared, destructured, a parameter, or a method
        const local = new RegExp([
          '(?:const|let|var|function\\*?|class)\\s[^;=]*?' + NOT_MEMBER + n + '(?![\\w$])',
          '[(,{\\[]\\s*(?:\\.\\.\\.)?' + n + '\\s*(?:[,)}\\]]|=(?![=>]))',
          NOT_MEMBER + n + '\\s*=>',
          '^\\s*(?:async\\s+|static\\s+|get\\s+|set\\s+)*' + n + '\\s*\\([^)]*\\)\\s*\\{',
        ].join('|'), 'm');
        if (!local.test(code)) errors.push(`${rel(f)}:${lineOf(code, use.index)}: '${name}' is used but not imported or declared in this file`);
      }
    }
    return { errors, note: `${count} shared names` };
  },

  // `LINES.key`, `STEPS.key`, `CARDS.key`… used in code exist in the text module they came from.
  async text() {
    const errors = [];
    let count = 0;
    for (const f of files) {
      for (const imp of importsOf(source[f])) {
        if (!/-text\.js$/.test(imp.spec)) continue;
        const mod = await import(pathToFileURL(resolve(dirname(f), imp.spec)).href);
        for (const { name, local } of imp.names) {
          const table = mod[name];
          if (!table || typeof table !== 'object' || Array.isArray(table)) continue;
          const use = new RegExp('(?<![\\w$.])' + lit(local) + '\\.(' + IDENT + ')', 'g');
          for (const m of source[f].matchAll(use)) {
            count++;
            if (!(m[1] in table)) errors.push(`${rel(f)}:${lineOf(source[f], m.index)}: ${name}.${m[1]} is not defined in ${imp.spec}`);
          }
        }
      }
    }
    return { errors, note: `${count} text keys` };
  },

  // Element ids looked up by literal name exist in the page that loads the
  // file (or are created in code): gallery.html for src/gallery/, index.html
  // for the rest.
  dom() {
    const errors = [];
    const made = new Set();
    for (const text of Object.values(source)) {
      for (const m of text.matchAll(/\bid="([\w-]+)"|\.id\s*=\s*'([\w-]+)'/g)) made.add(m[1] || m[2]);
    }
    const idsIn = (page) => new Set([...made, ...[...readFileSync(join(ROOT, page), 'utf8').matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])]);
    const pages = { 'index.html': idsIn('index.html'), 'gallery.html': idsIn('gallery.html') };
    let count = 0;
    for (const f of files) {
      const page = f.startsWith(GALLERY) ? 'gallery.html' : 'index.html';
      for (const m of source[f].matchAll(/(?:getElementById|(?<![\w$.])\$)\('([\w-]+)'\)/g)) {
        count++;
        if (!pages[page].has(m[1])) errors.push(`${rel(f)}:${lineOf(source[f], m.index)}: no element with id "${m[1]}" in ${page}`);
      }
    }
    return { errors, note: `${count} lookups` };
  },

  // The look-dev gallery: its page loads the same libraries as the game, the
  // game never imports it, and every contact sheet asks for things that exist.
  async gallery() {
    const errors = [];
    const map = (page) => readFileSync(join(ROOT, page), 'utf8').match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1].replace(/\s+/g, '');
    if (map('gallery.html') !== map('index.html')) errors.push("gallery.html: the import map differs from index.html's");
    for (const f of files) {
      if (f.startsWith(GALLERY)) continue;
      for (const imp of importsOf(source[f])) {
        if (resolve(dirname(f), imp.spec).startsWith(GALLERY)) errors.push(`${rel(f)}:${lineOf(source[f], imp.index)}: the game imports the gallery (${imp.spec})`);
      }
    }
    const { SHEETS } = await load('gallery/sheets.js');
    const { POSES, LIGHTS, VIEWS } = await load('gallery/presets.js');
    const { SLOTS, styleInfo } = await load('cosmetics.js');
    let count = 0;
    for (const [name, S] of Object.entries(SHEETS)) {
      const { cols, cells } = S.make({});
      if (!cells.length || !(cols > 0) || S.tile?.length !== 2 || !S.about) errors.push(`sheet ${name}: needs cells, cols, a tile size and an "about" line`);
      for (const { label, q } of cells) {
        count++;
        const bad = (what) => errors.push(`sheet ${name}, cell "${label}": ${what}`);
        if (q.view && !VIEWS[q.view]) bad(`no view "${q.view}"`);
        if (q.light && !LIGHTS[q.light]) bad(`no light "${q.light}"`);
        if (q.pose && !POSES[q.pose]) bad(`no pose "${q.pose}"`);
        for (const slot of SLOTS) if (q[slot] && !styleInfo(slot, q[slot])) bad(`no ${slot} style "${q[slot]}"`);
      }
    }
    return { errors, note: `${Object.keys(SHEETS).length} sheets, ${count} cells` };
  },

  // Saves of any age migrate to the current shape, and migrating twice changes nothing.
  async save() {
    const errors = [];
    const { migrate } = await load('save.js');
    const { SAVE_VERSION } = await load('config.js');
    const v1 = { v: 1, banked: 240, cargo: 0, health: 80, upgrades: { sail: 1 }, discovered: [0, 3], savePort: 0 };
    const cases = { empty: {}, v1, garbage: { quests: 7, story: 'x', rival: null, hold: {}, wardrobe: 'hat', ashore: null } };
    const objects = { quests: ['active', 'done', 'boards', 'pinned'], story: ['chapter', 'journals', 'flags', 'seenCards'], rival: ['chapter', 'wins', 'losses', 'flags'], ashore: [] };
    const arrays = ['wardrobe', 'hold'];
    for (const [label, input] of Object.entries(cases)) {
      const d = migrate(structuredClone(input));
      if (!d) { errors.push(`${label}: migrate returned null`); continue; }
      if (d.v !== SAVE_VERSION) errors.push(`${label}: v is ${d.v}, expected ${SAVE_VERSION}`);
      if (!('profile' in d)) errors.push(`${label}: missing profile`);
      for (const key of arrays) if (!Array.isArray(d[key])) errors.push(`${label}: ${key} is not an array`);
      for (const [key, fields] of Object.entries(objects)) {
        if (!d[key] || typeof d[key] !== 'object') { errors.push(`${label}: ${key} is not an object`); continue; }
        for (const k of fields) if (!(k in d[key])) errors.push(`${label}: missing ${key}.${k}`);
      }
      const once = JSON.stringify(d);
      if (once !== JSON.stringify(migrate(JSON.parse(once)))) errors.push(`${label}: migrating twice changed the save`);
      for (const k of ['banked', 'cargo', 'health', 'upgrades', 'discovered', 'savePort']) {
        if (JSON.stringify(d[k]) !== JSON.stringify(input[k])) errors.push(`${label}: migrate changed ${k}`);
      }
    }
    if (migrate(null) !== null || migrate('x') !== null) errors.push('migrate should return null for a non-object');
    return { errors, note: `${Object.keys(cases).length} saves` };
  },

  // Ashore layouts validate for islands across the whole difficulty range, in
  // every biome that has levels (`count` islands each).
  async layout(count = 150) {
    const errors = [];
    const { layoutLevel } = await load('ashore/modules.js');
    const { mulberry32 } = await load('util.js');
    const { ASHORE_BIOMES } = await load('config.js');
    const notes = [];
    let retries = 0;
    for (const biome of ASHORE_BIOMES) {
      const rng = mulberry32(20261125);
      const tiers = {};
      for (let i = 0; i < count; i++) {
        const a = rng() * Math.PI * 2, dist = 300 + rng() * 6500;
        const I = { id: i + 1, seed: Math.floor(rng() * 100000), x: Math.cos(a) * dist, z: Math.sin(a) * dist, r: 60 + rng() * 160, biome, landmark: null };
        const what = `${biome} island seed ${I.seed} (r ${I.r.toFixed(0)}, ${dist.toFixed(0)} m out)`;
        let L;
        try { L = layoutLevel(I, { landingAngle: rng() * Math.PI * 2 }); }
        catch (e) { errors.push(`${what}: threw ${e.message}`); continue; }
        tiers[L.tier] = (tiers[L.tier] || 0) + 1;
        retries += L.attempt;
        if (!L.validation.ok) errors.push(`${what}, ${L.tier}: ${L.validation.errors.slice(0, 3).join('; ')}`);
      }
      notes.push(`${biome} ${Object.entries(tiers).map(([t, n]) => `${n} ${t}`).join(' ')}`);
    }
    return { errors, note: `${count} islands per biome (${notes.join('; ')}; ${retries} re-rolls)` };
  },

  // A test climber walks generated levels from the beach to the summit, on
  // islands of every tier in every biome that has levels (`count` per biome).
  async climb(count = 12) {
    const errors = [];
    const { layoutLevel, routeStats } = await load('ashore/modules.js');
    const { mulberry32 } = await load('util.js');
    const { ASHORE_BIOMES } = await load('config.js');
    const climber = await testClimber();
    const notes = [];
    for (const biome of ASHORE_BIOMES) {
      const rng = mulberry32(4401);
      let secs = 0, jumps = 0;
      for (let i = 0; i < count; i++) {
        // spread evenly out from Port Haven, so every tier gets climbed
        const a = rng() * Math.PI * 2, dist = 400 + (i + rng()) * (6400 / count);
        const I = { id: i + 1, seed: Math.floor(rng() * 100000), x: Math.cos(a) * dist, z: Math.sin(a) * dist, r: 60 + rng() * 160, biome, landmark: null };
        const L = layoutLevel(I, { landingAngle: rng() * Math.PI * 2 });
        const level = { ...L, groundAt: L.T.groundAt, groundTag: L.T.groundTag, waterY: 0 };
        secs += climber(level, generatedRoute(L), `${biome} seed ${I.seed} (${L.tier}) main`, errors, 3);
        jumps += routeStats(L).jumps;
      }
      notes.push(`${biome} ${Math.round(secs / count)} s, ${Math.round(jumps / count)} jumps`);
    }
    return { errors, note: `${count} islands per biome to the summit, on average ${notes.join('; ')}; ${climber.stats.retries} hops needed a second try` };
  },

  // The Elder Grove: the layout keeps its design limits, and a test climber
  // (the real controller, steered by a simple pilot) gets from the beach to
  // the owl bough at a walk, and on up to the crown.
  async grove() {
    const { buildGroveLayout, validateGrove, footGap, nodeFoot, supportAt } = await load('ashore/grove-layout.js');
    const { CharacterController } = await load('ashore/controller.js');
    const { ASHORE } = await load('config.js');
    const L = buildGroveLayout();
    const v = validateGrove(L);
    const errors = [...v.errors];
    const climber = await testClimber();
    const climb = (nodes, label) => climber(L, nodes, label, errors);
    // Holding the stick along a ledge must carry you up its little steps without
    // steering: the risers meet you at a slant, and you must not slide off them.
    const R = L.route;
    for (let i = 0; i + 3 < R.length; i++) {
      const joined = (k) => R[i + k].piece?.kind === 'bark' && (k === 0 || (R[i + k].y - R[i + k - 1].y <= ASHORE.stepUp && footGap(nodeFoot(R[i + k - 1]), nodeFoot(R[i + k])) < 0.05));
      if (![0, 1, 2, 3].every(joined)) continue;
      const ctl = new CharacterController(L, ASHORE), a0 = Math.atan2(R[i].z, R[i].x);
      ctl.teleport(R[i].x, R[i].y + 0.05, R[i].z, 0);
      let far = 0;
      for (let k = 0; k < 60; k++) {
        const a = Math.atan2(ctl.pos.z, ctl.pos.x);
        ctl.update(1 / 60, { wishX: -Math.sin(a), wishZ: Math.cos(a) });
        far = Math.max(far, Math.hypot(ctl.pos.x, ctl.pos.z) - Math.hypot(R[i].x, R[i].z));
      }
      const turned = Math.atan2(Math.sin(Math.atan2(ctl.pos.z, ctl.pos.x) - a0), Math.cos(Math.atan2(ctl.pos.z, ctl.pos.x) - a0));
      if (turned < 0.4 || far > 0.5) errors.push(`main[${i}]: walking along the ledge stalls or slides out (turned ${turned.toFixed(2)}, drifted ${far.toFixed(2)} m)`);
    }
    const main = climb(L.route, 'main');
    const crown = climb(L.crown, 'crown');
    const s = v.stats;
    return { errors, note: `${s.pieces} pieces, ${s.coins} coins; to the owl bough in ${main.toFixed(0)} s (${s.jumps} jumps), the crown in ${crown.toFixed(0)} s more (${s.crownJumps} jumps)` };
  },
};

/**
 * A test climber: the real controller, steered by a simple pilot from node to
 * node of a route. It walks, runs at wide gaps, and jumps at a ledge too high
 * to step onto or where the footing ends. Returns
 * (level, nodes, label, errors, tries = 1) => seconds taken; problems go into
 * `errors`. With tries > 1 a missed hop is tried again from its start at the
 * other pace (walk ↔ run), as a player would; stats.retries counts them.
 * `level` needs groundAt, colliders and pieces (with footprints).
 */
async function testClimber() {
  const { footGap, nodeFoot, supportAt } = await load('ashore/grove-layout.js');
  const { CharacterController } = await load('ashore/controller.js');
  const { ASHORE } = await load('config.js');
  const climb = (L, nodes, label, errors, tries = 1) => {
    const ctl = new CharacterController(L, ASHORE);
    ctl.teleport(nodes[0].x, nodes[0].y + 0.05, nodes[0].z, 0);
    let t = 0;
    for (let i = 1; i < nodes.length; i++) {
      const A = nodes[i - 1], B = nodes[i], wide = footGap(nodeFoot(A), nodeFoot(B)) > 1.5;
      const what = `${label}[${i}] ${A.piece?.kind || 'ground'}→${B.piece?.kind || 'ground'}`;
      let problem = null;
      for (let attempt = 0; attempt < tries; attempt++) {
        if (attempt) { climb.stats.retries++; ctl.teleport(A.x, A.y + 0.05, A.z, 0); }
        const run = attempt % 2 ? !wide : wide;
        problem = null;
        let held = 0;
        for (let k = 0; ; k++) {
          const p = ctl.pos, dx = B.x - p.x, dz = B.z - p.z, d = Math.hypot(dx, dz) || 1;
          // a spot on the ground counts if you're on something just above it (a bridge's end, say)
          if (ctl.grounded && d < 0.7 && p.y - B.y > -0.25 && p.y - B.y < (B.piece ? 0.25 : 0.6)) break;
          if (k > 60 * 25) { problem = `the climber got stuck at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`; break; }
          if (p.y < Math.min(A.y, B.y) - 2.5) { problem = `the climber fell (to ${p.y.toFixed(1)} m)`; break; }
          // the footing ends if both looks ahead find nothing near (one alone may fall in a seam between joined steps)
          const ahead = Math.max(...[0.45, 0.65].map((s) => supportAt(L, p.x + (dx / d) * s, p.z + (dz / d) * s, p.y + 0.4)));
          const wall = B.y > p.y + ASHORE.stepUp && (B.piece ? footGap(B.piece.foot, [[p.x, p.z]]) < 0.75 : d < 1.2);
          const jump = ctl.grounded && (wall || ahead < p.y - 0.5);
          if (jump) held = 30;
          ctl.update(1 / 60, { wishX: dx / d, wishZ: dz / d, run, jumpPressed: jump, jumpHeld: held-- > 0 });
          t += 1 / 60;
        }
        if (!problem) break;
      }
      if (problem) { errors.push(`${what}: ${problem}`); return t; }
    }
    return t;
  };
  climb.stats = { retries: 0 };
  return climb;
}

/**
 * A generated layout's main route as climber nodes: a walked stretch follows
 * its walk polyline (a straight line across the meadow could cut through
 * the cliff), and the summit is the end.
 */
function generatedRoute(L) {
  const out = [];
  const same = (a, x, z) => Math.hypot(a[0] - x, a[1] - z) < 0.05;
  for (const n of L.route) {
    const prev = out[out.length - 1];
    if (prev && n.type === 'ground' && n.edge === 'walk' && prev.type === 'ground') {
      const w = L.walks.find((line) => same(line[line.length - 1], n.x, n.z));
      if (w) for (const [x, z] of w.slice(1, -1)) out.push({ type: 'ground', x, z, y: L.T.groundAt(x, z) });
    }
    out.push(n);
  }
  const last = L.walks[L.walks.length - 1];
  for (const [x, z] of last) out.push({ type: 'ground', x, z, y: L.T.groundAt(x, z) });
  return out;
}

// --------------------------------------------------------------------- main
const [only, arg] = process.argv.slice(2);
if (only && !checks[only]) {
  console.error(`Unknown check "${only}". Choose from: ${Object.keys(checks).join(', ')}`);
  process.exit(2);
}
let failed = 0;
for (const name of only ? [only] : Object.keys(checks)) {
  const t0 = performance.now();
  let result;
  try { result = await checks[name](arg ? Number(arg) : undefined); }
  catch (e) { result = { errors: [e.stack || String(e)], note: 'crashed' }; }
  const ms = Math.round(performance.now() - t0);
  if (result.errors.length) {
    failed++;
    console.log(`FAIL ${name} (${result.note}, ${ms} ms)`);
    for (const e of result.errors.slice(0, 25)) console.log('  ' + e.replace(/\n/g, '\n  '));
    if (result.errors.length > 25) console.log(`  …and ${result.errors.length - 25} more`);
  } else {
    console.log(`ok   ${name} (${result.note}, ${ms} ms)`);
  }
}
process.exit(failed ? 1 : 0);
