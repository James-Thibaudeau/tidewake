#!/usr/bin/env node
// Fast checks that need no browser and no dependencies:
//
//   node tools/check.mjs            everything (about a second)
//   node tools/check.mjs imports    one group: syntax | imports | names | text | dom | gallery | save | paints | sea | music | seazones | rogue | ride | layout | climb | grove | archway
//   node tools/check.mjs layout 500 layouts for 500 synthetic islands (default 150)
//
// Run it after every change. It catches the mistakes that otherwise only show
// up as a blank page: a syntax error, an import of a name the other module
// doesn't export, a helper left behind when code moved to another file, a
// text key or element id that doesn't exist, a save that no longer migrates,
// a sea event that could turn up in the wrong place, a tune with a note out
// of its key or its instrument's range, music that flips at a zone's edge, sea zones that leave home
// out, put rough water over a port or a landing, or disagree between the CPU
// and the shaders, a rogue wave that the boat and the shaders see differently,
// that never arrives or costs the wrong share of the hull, ice outside the
// Reach, a wave set the boat rides too hard or too gently, and an ashore
// layout that fails its own validation.
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
    // the Shipwrecked screen comes up over the fade-out (game.js), so it must be drawn above it
    const css = readFileSync(join(ROOT, 'style.css'), 'utf8');
    const zOf = (sel) => Number(css.match(new RegExp('^' + sel + ' \\{[^}]*?z-index: (\\d+)', 'm'))?.[1]);
    if (!(zOf('#wreckScreen') > zOf('#fade'))) errors.push(`style.css: #wreckScreen (z-index ${zOf('#wreckScreen')}) must be above #fade (${zOf('#fade')}), or a wreck ends on a blank screen`);
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
    const { SHEETS, PAINT_PARAMS } = await load('gallery/sheets.js');
    const { LIVERY_PARTS, paintInfo } = await load('paints.js');
    const { POSES, LIGHTS, VIEWS, SEA_PLACES, ROUGH_PLACES } = await load('gallery/presets.js');
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
        if (q.zone && !SEA_PLACES[q.zone]) bad(`no sea place "${q.zone}"`);
        if (q.severity != null && !(ROUGH_PLACES[q.severity] && (q.zone === 'rough' || q.zone === 'offing'))) bad(`severity "${q.severity}" needs zone rough or offing, and a zone of that severity`);
        if (q.rogue != null && !Number.isFinite(Number(q.rogue))) bad(`rogue "${q.rogue}" is not a number of seconds`);
        for (const slot of SLOTS) if (q[slot] && !styleInfo(slot, q[slot])) bad(`no ${slot} style "${q[slot]}"`);
        for (const [key, part] of Object.entries(PAINT_PARAMS)) {
          const kind = LIVERY_PARTS.find((p) => p.id === part)?.kind;
          if (q[key] && !paintInfo(kind, q[key])) bad(`no ${kind} "${q[key]}" for ${key}`);
        }
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
    const objects = { quests: ['active', 'done', 'boards', 'pinned', 'reports'], story: ['chapter', 'journals', 'flags', 'seenCards'], rival: ['chapter', 'wins', 'losses', 'flags', 'log'], ashore: [], sightings: ['seen', 'miss', 'chain'] };
    const arrays = ['wardrobe', 'hold', 'paints'];
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
    // a save from before Sable's log was kept gets what was said in the encounters behind it
    for (const chapter of [0, 3, 6, 8]) {
      const log = migrate({ profile: { name: 'Wren' }, rival: { chapter } }).rival.log;
      const want = Math.min(chapter, 6) + (chapter >= 6) + (chapter >= 7) + (chapter >= 8);
      if (log.length !== want) errors.push(`rival chapter ${chapter}: ${log.length} log entries, expected ${want}`);
      if (log.some((e) => !e.title || !e.lines.length || e.lines.some((l) => /\{\w+\}/.test(l)))) errors.push(`rival chapter ${chapter}: a log entry is untitled, empty or unfilled`);
    }
    // crabs reported before the Sightings log was kept go in it; a log already there is left alone
    const crabbed = migrate({ quests: { reports: { archCrabs: { state: 'done', port: 4, day: 6 } } } }).sightings.seen.archCrabs;
    if (crabbed?.n !== 1 || crabbed.day !== 6) errors.push('a save with the crabs reported should have them in the Sightings log');
    const kept = migrate({ sightings: { seen: { whale: { n: 3, day: 2, near: 'x' } }, miss: { ghostShip: 4 }, chain: { stage: 2, island: 31 } } }).sightings;
    if (kept.seen.whale?.n !== 3 || kept.miss.ghostShip !== 4 || kept.chain?.island !== 31) errors.push('migrate changed the Sightings log');
    // the paint yard: a livery always has every part; Sable's crimson dye, once a toggle, becomes a sail cloth
    const { PART_IDS } = await load('paints.js');
    for (const [label, input] of Object.entries(cases)) {
      const L = migrate(structuredClone(input)).livery;
      if (!L || PART_IDS.some((k) => L[k] !== null)) errors.push(`${label}: the livery should be every part as built`);
    }
    const dyed = migrate({ rival: { chapter: 8, flags: { dye: true, dyeOn: true } } });
    if (dyed.livery.sail !== 'crimson' || 'dyeOn' in dyed.rival.flags) errors.push('a save with the crimson dye on should wear crimson sails, and lose the old toggle');
    const off = migrate({ rival: { chapter: 8, flags: { dye: true, dyeOn: false } } });
    if (off.livery.sail !== null || !off.rival.flags.dye) errors.push('a save with the crimson dye off should keep its sails (and its gift)');
    const odd = migrate({ paints: ['paint:plum', 3], livery: { hull: 'plum', sail: 'plum', figurehead: 'owl', mast: 'gold' } });
    if (odd.paints.length !== 1 || odd.livery.hull !== 'plum' || odd.livery.sail !== null || odd.livery.figurehead !== 'owl' || 'mast' in odd.livery) errors.push('migrate should keep good paints and drop what doesn\'t fit its part');
    return { errors, note: `${Object.keys(cases).length} saves` };
  },

  // The paint yard's catalog (paints.js): every item is sold or earned, priced
  // in its kind's range, on a part that takes it; earned ones unlock from the
  // state they name; and a livery becomes the colours the boat draws.
  async paints() {
    const errors = [];
    const P = await load('paints.js');
    const { PAINTS, LIVERY_PARTS, KINDS, keyOf, ownsPaint, isEarned, newlyEarned, liveryFor, normalizeLivery, blankLivery, paintsOf } = P;
    const RANGE = { paint: [200, 600], cloth: [400, 1000], emblem: [500, 1200], flag: [150, 400], figurehead: [1500, 3000] };
    const keys = new Set();
    for (const p of PAINTS) {
      const k = keyOf(p);
      if (keys.has(k)) errors.push(`${k}: listed twice`);
      keys.add(k);
      if (!KINDS[p.kind] || !RANGE[p.kind]) errors.push(`${k}: no such kind`);
      if (!p.name) errors.push(`${k}: no name`);
      if (p.earn) { if (p.price || !p.earn.hint) errors.push(`${k}: an earned item has no price and a hint`); }
      else if (!(p.price >= RANGE[p.kind][0] && p.price <= RANGE[p.kind][1])) errors.push(`${k}: ${p.price} gold is outside ${RANGE[p.kind].join('-')}`);
      if (['paint', 'cloth', 'flag'].includes(p.kind) && !/^#[0-9a-f]{6}$/i.test(p.color || '')) errors.push(`${k}: needs a colour`);
      if (p.color2 && !p.pattern) errors.push(`${k}: a second colour with no pattern`);
    }
    for (const kind of Object.keys(KINDS)) {
      if (!paintsOf(kind).some((p) => !p.earn)) errors.push(`${kind}: nothing to buy`);
      if (!LIVERY_PARTS.some((part) => part.kind === kind)) errors.push(`${kind}: no part takes it`);
    }
    // earned items: locked on a fresh save, unlocked by what they say
    const fresh = { rival: { chapter: 0, flags: {} }, wardrobe: [], paints: [] };
    const earned = PAINTS.filter((p) => p.earn);
    for (const p of earned) if (isEarned(fresh, p, { charted: false })) errors.push(`${keyOf(p)}: earned on a fresh save`);
    const done = { rival: { chapter: 8, flags: { dye: true } }, wardrobe: ['hat:flowerCrown'], paints: [] };
    for (const p of earned) if (!isEarned(done, p, { charted: true })) errors.push(`${keyOf(p)}: not earned when its rule is met`);
    if (newlyEarned(done, { charted: true }).length !== earned.length) errors.push('newlyEarned should list every earned item not yet claimed');
    if (newlyEarned({ ...done, paints: earned.map(keyOf) }, { charted: true }).length) errors.push('newlyEarned should skip claimed items');
    if (!ownsPaint({ paints: ['emblem:owl'] }, 'emblem', 'owl') || ownsPaint({ paints: ['emblem:owl'] }, 'figurehead', 'owl')) errors.push('the owl emblem and the owl figurehead should be owned apart');
    // liveries
    if (liveryFor(blankLivery()) !== null) errors.push('an unpainted livery should draw as the tier\'s look (null)');
    const all = Object.fromEntries(LIVERY_PARTS.map((part) => [part.id, paintsOf(part.kind).find((p) => p.pattern || p.shape)?.id || paintsOf(part.kind)[0].id]));
    const L = liveryFor(all);
    for (const part of LIVERY_PARTS) if (!L?.[part.id]) errors.push(`liveryFor left out the ${part.id}`);
    if (!L.sailLook?.pattern || !L.flagLook?.shape && !L.flagLook?.pattern) errors.push('liveryFor should carry a patterned cloth\'s look');
    if (JSON.stringify(normalizeLivery(all)) !== JSON.stringify(all)) errors.push('normalizeLivery changed a good livery');
    return { errors, note: `${PAINTS.length} items, ${earned.length} earned, ${LIVERY_PARTS.length} parts` };
  },

  // The living sea's rules (sightings.js): each kind turns up only where and
  // when it should, the pity timer brings the rare one round, events are
  // placed in open water off the bow (`count` placements in a toy sea), and
  // the Sightings log, its milestones and its words all line up.
  async sea(count = 3000) {
    const errors = [];
    const S = await load('sightings.js');
    const { EVENTS, LOG, MILESTONES, HEARS, BOUNTY_KINDS, eventWeights, canHappenAt, applyBounties, pickKind, placeEvent, openWater, recordSighting, nextRoll } = S;
    const { mulberry32 } = await load('util.js');
    const { WORLD_HALF } = await load('config.js');
    const { STYLES } = await load('cosmetics.js');
    const { SIGHTINGS, REPORTS, BOUNTY, BOTTLES, GHOST_LOG } = await load('story-text.js');
    const ROLES = { chart: 1, deliver: 1, salvage: 1, retrieve: 1, report: 1 }; // the giver roles in quests.js (which needs three.js)
    const expect = (ok, what) => { if (!ok) errors.push(what); };
    const kinds = Object.keys(EVENTS);

    // where and when
    const W = (o = {}) => eventWeights({ z: 0, night: 0, weather: 'clear', chapter: 3, ...o });
    const north = -WORLD_HALF * 0.8, south = WORLD_HALF * 0.8;
    expect(W({ z: south }).whale === 0, 'whales turn up in tropical water');
    expect(W({ weather: 'storm' }).whale === 0, 'whales turn up in a storm');
    expect(W({ z: north }).whale > W().whale && W().whale > 0, 'whales should be likeliest in cold water, and found in temperate water');
    expect(W({ z: north }).dolphins === 0, 'dolphins turn up in cold water');
    for (const w of ['cloudy', 'rain', 'storm', 'fog']) expect(W({ weather: w }).dolphins === 0, `dolphins turn up in ${w}`);
    expect(W({ z: south }).dolphins > W().dolphins && W({ weather: 'breezy' }).dolphins > 0, 'dolphins should be likeliest in tropical water, in clear or breezy weather');
    expect(W().ghostShip === 0 && W({ night: 0.5 }).ghostShip === 0, 'the ghost ship turns up by day');
    expect(W({ night: 1, chapter: 1 }).ghostShip === 0, 'the ghost ship turns up before the first journal');
    expect(W({ night: 1, weather: 'fog' }).ghostShip > W({ night: 1 }).ghostShip && W({ night: 1 }).ghostShip > 0, 'the ghost ship should turn up at night, likelier in fog');
    expect(W({ night: 1 }).ghostShip < W({ night: 1 }).whale, 'the ghost ship should be rarer than a whale');
    expect(W({ z: south }).turtles > 0 && W().turtles === 0 && W({ z: north }).turtles === 0, 'turtles should turn up in tropical water only');
    expect(W({ z: south, night: 1 }).turtles === 0 && W({ z: south, weather: 'rain' }).turtles === 0, 'turtles turn up at night or in the rain');
    expect(W({ z: south, night: 1 }).bloom > W({ night: 1 }).bloom && W({ night: 1 }).bloom > 0, 'the bloom should be likeliest in tropical water, and found in temperate water');
    expect(W({ z: south }).bloom === 0 && W({ z: north, night: 1 }).bloom === 0, 'the bloom turns up by day or in cold water');
    expect(W({ z: north }).iceberg > 0 && W().iceberg === 0 && W({ z: south }).iceberg === 0, 'icebergs should turn up in cold water only');
    expect(W({ weather: 'storm' }).waterspout > 0 && ['clear', 'breezy', 'cloudy', 'rain', 'fog'].every((w) => W({ weather: w }).waterspout === 0), 'waterspouts should turn up in storms only');
    expect(W().bottle > 0 && W({ z: north }).bottle > 0 && W({ z: south, night: 1 }).bottle > 0 && W({ weather: 'storm' }).bottle === 0, 'a bottle should turn up anywhere, but not in a storm');
    expect(W().bottle < W().whale, 'a bottle should be less common than a whale');
    // the sea zones (sea-zones.js): rough water breeds waterspouts, but only in a storm; turtles and the bloom favour the home shallows
    const inRough = { shallow: 0, rough: 1 }, atHome = { shallow: 1, rough: 0 }, plainSea = { shallow: 0, rough: 0 };
    expect(W({ weather: 'storm', sea: inRough }).waterspout > W({ weather: 'storm' }).waterspout && W({ sea: inRough }).waterspout === 0, 'waterspouts should be likelier in rough water, and still only in a storm');
    expect(W({ sea: atHome }).turtles > W({ z: south }).turtles && W({ sea: atHome, night: 1 }).turtles === 0 && W({ z: north, sea: plainSea }).turtles === 0, 'turtles should favour the home shallows, by day, and stay out of cold water elsewhere');
    expect(W({ night: 1, sea: atHome }).bloom > W({ night: 1 }).bloom && W({ sea: atHome }).bloom === 0, 'the bloom should favour the home shallows, at night');
    expect(JSON.stringify(W({ sea: plainSea })) === JSON.stringify(W()) && JSON.stringify(W({ night: 1, weather: 'storm', sea: plainSea })) === JSON.stringify(W({ night: 1, weather: 'storm' })), 'plain sea should leave the weights as they are');
    // in a storm the waterspout is the likeliest thing by far
    const storm = W({ weather: 'storm', night: 1 });
    expect(kinds.every((k) => k === 'waterspout' || storm[k] < storm.waterspout), 'the waterspout should be the likeliest thing in a storm');

    // bounties: only kinds you can go looking for, likelier inside the circle, never where they can't happen
    for (const k of BOUNTY_KINDS) {
      expect(EVENTS[k] && SIGHTINGS[k]?.wanted, `bounty kind ${k} needs to be an event with a "wanted" name`);
      expect([north, 0, south].some((z) => canHappenAt(k, z)), `bounty kind ${k} can't happen anywhere`);
    }
    expect(!canHappenAt('iceberg', south) && canHappenAt('iceberg', north) && !canHappenAt('turtles', north) && canHappenAt('ghostShip', 0), 'canHappenAt disagrees with the weights');
    const circle = [{ kind: 'whale', x: 0, z: 0, r: 500 }, { kind: 'iceberg', x: 0, z: 0, r: 500 }];
    const inC = W(), outC = W();
    expect(applyBounties(inC, circle, 100, 100) && inC.whale === W().whale * 4 && inC.iceberg === 0, 'a bounty should make its kind 4x likelier inside the circle, and never possible where it is not');
    expect(!applyBounties(outC, circle, 900, 0) && outC.whale === W().whale, 'a bounty should change nothing outside its circle');
    for (const key of ['title', 'text', 'search', 'seen']) expect(BOUNTY[key], `BOUNTY.${key} is missing`);

    // picking: by weight, never what can't happen, and the pity timer
    const rng = mulberry32(20261125);
    const tally = {}, miss = {};
    let gap = 0, longest = 0;
    for (let i = 0; i < 4000; i++) {
      const k = pickKind(rng, W({ night: 1 }), miss);
      tally[k] = (tally[k] || 0) + 1;
      if (k === 'ghostShip') { longest = Math.max(longest, gap); gap = 0; } else gap++;
    }
    expect(['whale', 'dolphins', 'bloom', 'bottle', 'ghostShip'].every((k) => tally[k] > 0) && !tally.turtles && !tally.iceberg && !tally.waterspout,
      `4000 clear temperate night rolls should bring whales, dolphins, the bloom, bottles and the ghost ship, and nothing else (${JSON.stringify(tally)})`);
    expect(longest <= 8, `the ghost ship stayed away for ${longest} rolls in a row: the pity timer should cap it at 8`);
    for (let i = 0; i < 500; i++) expect(pickKind(rng, W(), {}) !== 'ghostShip', 'the ghost ship was picked by day');
    expect(pickKind(rng, Object.fromEntries(kinds.map((k) => [k, 0])), {}) === null, 'something was picked when nothing can happen');
    for (let i = 0; i < 50; i++) { const t = nextRoll(rng); expect(t >= 180 && t <= 360, `the next roll in ${t.toFixed(0)} s: should be 3-6 minutes`); }

    // placing: a toy sea of round islands with a rock or two off each
    const isles = [];
    for (let i = 0; i < 60; i++) isles.push({ x: (rng() * 2 - 1) * 6000, z: (rng() * 2 - 1) * 6000, r: 50 + rng() * 220 });
    for (const I of isles) { I.bound = I.r * 1.32; const a = rng() * 6.283; I.rock = { x: I.x + Math.cos(a) * (I.r + 50), z: I.z + Math.sin(a) * (I.r + 50), r: 5 }; }
    const sea = {
      islands: isles,
      heightAt: (x, z) => Math.max(-40, ...isles.map((I) => (I.r - Math.hypot(I.x - x, I.z - z)) * 0.5)),
      rockHit: (x, z, rad) => isles.find((I) => Math.hypot(I.rock.x - x, I.rock.z - z) < I.rock.r + rad)?.rock || null,
    };
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const boat = { x: (rng() * 2 - 1) * 6200, z: (rng() * 2 - 1) * 6200, heading: rng() * 6.283 };
      // each kind has its own distances (a bottle is close, a waterspout is not)
      const P = { min: 150, max: 300, clear: 60, ...EVENTS[kinds[i % kinds.length]].place };
      const at = placeEvent(rng, sea, boat, EVENTS[kinds[i % kinds.length]].place);
      if (!at) continue;
      placed++;
      const d = Math.hypot(at.x - boat.x, at.z - boat.z);
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(at.x - boat.x, at.z - boat.z) - boat.heading), Math.cos(Math.atan2(at.x - boat.x, at.z - boat.z) - boat.heading)));
      const where = `placement ${i} (${at.x.toFixed(0)}, ${at.z.toFixed(0)})`;
      if (d < P.min - 1 || d > P.max + 1) errors.push(`${where}: ${d.toFixed(0)} m from the boat, should be ${P.min}-${P.max}`);
      if (off < 0.3) errors.push(`${where}: dead ahead (${off.toFixed(2)} rad off the bow)`);
      if (!openWater(sea, at.x, at.z, P.clear)) errors.push(`${where}: not open water`);
      if (isles.some((I) => Math.hypot(I.x - at.x, I.z - at.z) < I.r + 30)) errors.push(`${where}: on or against an island`);
      if (Math.abs(at.x) > WORLD_HALF - 350 || Math.abs(at.z) > WORLD_HALF - 350) errors.push(`${where}: outside the world`);
      if (errors.length > 12) break;
    }
    expect(placed > count * 0.6, `only ${placed} of ${count} placements found room: open water should nearly always have some`);
    expect(!placeEvent(rng, sea, { x: isles[0].x, z: isles[0].z, heading: 0 }, { min: 10, max: isles[0].r * 0.5 }), 'an event was placed in the middle of an island');

    // the log and its milestones
    const seen = {};
    const five = [1, 2, 3, 4, 5, 6].map((day) => recordSighting(seen, 'whale', { day, near: 'north of here' }));
    expect(five[0].first && !five[1].first, 'only the first sighting should be the first');
    expect(five.map((r) => !!r.milestone).join() === 'false,false,false,false,true,false', 'the whale milestone should be earned on the fifth sighting only');
    expect(seen.whale.n === 6 && seen.whale.day === 1 && seen.whale.near === 'north of here', 'the log should keep the count, and the first day and place');

    // the words: every kind has its lines, its card and (the living sea's own) its report
    for (const k of kinds) {
      for (const key of ['name', 'hint', 'cue', 'tip', 'about']) expect(SIGHTINGS[k]?.[key], `SIGHTINGS.${k}.${key} is missing`);
      for (const key of ['added', 'title', 'text', 'label', 'status', 'eyebrow', 'done', 'pageName', 'page', 'gold']) expect(REPORTS[k]?.[key], `REPORTS.${k}.${key} is missing`);
      expect(k === 'bottle' || REPORTS[k]?.stale, `REPORTS.${k}.stale is missing`); // the bottle's letter keeps
      expect(LOG.includes(k), `${k} has no card in the Sightings tab (LOG)`);
      expect(ROLES[HEARS[k]], `${k} has nobody to hear about it (HEARS)`);
    }
    expect(BOTTLES.notes?.length >= 4 && BOTTLES.letter?.text && BOTTLES.chart?.text && BOTTLES.note?.title, 'BOTTLES needs a letter, a chart, a note title and a few notes');
    expect(GHOST_LOG.cards?.length >= 3 && GHOST_LOG.cards.every((c) => c.art && c.text) && GHOST_LOG.text && GHOST_LOG.noAnchor && GHOST_LOG.found?.text, "GHOST_LOG needs its steps, its find and the log's cards");
    for (const k of LOG) for (const key of ['name', 'hint', 'about']) expect(SIGHTINGS[k]?.[key], `SIGHTINGS.${k}.${key} is missing`);
    for (const [k, M] of Object.entries(MILESTONES)) {
      expect(STYLES.some((s) => s.id === M.cosmetic), `milestone ${k}: no cosmetic "${M.cosmetic}"`);
      expect(SIGHTINGS.rewards[k]?.title && SIGHTINGS.rewards[k]?.text, `SIGHTINGS.rewards.${k} needs a title and text`);
    }
    return { errors, note: `${kinds.length} kinds; ${placed} of ${count} placements in open water; the ghost ship at most ${longest} rolls apart` };
  },

  // The score (music/, music-cues.js): every theme is written properly and
  // stays in its key, every cue plays through with each note inside its
  // instrument's range, the layers come in by intensity, a statement is
  // followed by a rest on the bed, changes of cue happen as designed (in the
  // same key, to another key, to silence), each band of the sea gets its cue,
  // and sailing back and forth across a band's edge never makes the music
  // flip more than once a crossing. It can't hear any of it.
  async music() {
    const errors = [];
    const expect = (ok, msg) => { if (!ok) errors.push(msg); };
    const N = await load('music/notation.js');
    const { THEMES, CUES, RANGES, DRUMS, STINGS } = await load('music/themes.js');
    const { Score, compileCue, EXTRAS, stingNotes } = await load('music/score.js');
    const { cueFor, CueHold } = await load('music-cues.js');
    const { VOICES } = await load('audio/instruments.js');
    const { MUSIC } = await load('config.js');
    const Z = await load('sea-zones.js');
    const throws = (fn) => { try { fn(); return false; } catch { return true; } };

    // the notation itself
    expect(N.noteMidi('A4') === 69 && N.noteMidi('C4') === 60 && N.noteMidi('F#4') === 66 && N.noteMidi('Bb3') === 58, 'noteMidi: A4 is 69, C4 60, F#4 66, Bb3 58');
    expect(Math.abs(N.hz(69) - 440) < 1e-9 && Math.abs(N.hz(57) - 220) < 1e-9, 'hz: A4 is 440 Hz');
    for (const [key, want] of [['D major', 0], ['B minor', 0], ['E dorian', 0], ['G mixolydian', -2], ['A dorian', 5], ['C phrygian', 6]]) {
      expect(N.keyShift(key) === want, `keyShift('${key}') is ${N.keyShift(key)}, not ${want}: one-shots would be played in the wrong key`);
    }
    expect(throws(() => N.parseBars('D4 . .', 4)), 'parseBars must refuse a bar with the wrong number of steps');
    expect(throws(() => N.parseBars('. - D4 .', 4)), 'parseBars must refuse a hold with no note before it');
    expect(throws(() => N.parseChord('H')) && throws(() => N.noteMidi('D')), 'a bad chord or note name must throw');

    // themes: bars of chords match bars of tune, and nothing strays from the key
    for (const [id, T] of Object.entries(THEMES)) {
      let key;
      try { key = N.parseKey(T.key); } catch (e) { errors.push(`theme ${id}: ${e.message}`); continue; }
      for (const [pid, P] of Object.entries(T.phrases)) {
        try {
          const chords = N.parseChords(P.chords), tune = N.parseTune(P.tune, T.steps);
          expect(chords.length === tune.length, `theme ${id}, phrase ${pid}: ${chords.length} bars of chords, ${tune.length} of tune`);
          for (const n of tune.flat()) expect(key.scale.includes(n.midi % 12), `theme ${id}, phrase ${pid}: ${N.noteName(n.midi)} is not in ${T.key}`);
          for (const c of chords.flat()) expect(key.scale.includes(c.root), `theme ${id}, phrase ${pid}: the chord ${c.name} is not in ${T.key}`);
        } catch (e) { errors.push(`theme ${id}, phrase ${pid}: ${e.message}`); }
      }
    }
    for (const v of [...Object.keys(RANGES), ...Object.values(DRUMS)]) expect(VOICES[v], `"${v}" has a range or a drum letter but audio/instruments.js has no such voice`);
    for (const [v, V] of Object.entries(VOICES)) expect(RANGES[v] || Object.values(DRUMS).includes(v), `the voice "${v}" (${V.kind}) has no range in music/themes.js and is not a drum`);

    // every cue, played through on paper
    let bars = 0;
    const inRange = (name, b) => {
      for (const e of b.events) {
        if (e.midi == null) { expect(Object.values(DRUMS).includes(e.voice), `cue ${name}: a note without a pitch on "${e.voice}"`); continue; }
        const R = RANGES[e.voice];
        if (!R) { errors.push(`cue ${name}: no range for "${e.voice}"`); continue; }
        const [lo, hi] = R.map(N.noteMidi);
        expect(e.midi >= lo && e.midi <= hi, `cue ${name}, ${e.layer}: ${N.noteName(e.midi)} is outside the ${e.voice}'s range (${R.join(' to ')})`);
        expect(e.at >= 0 && e.at < b.seconds && e.vol > 0, `cue ${name}, ${e.layer}: a note at ${e.at.toFixed(2)} s in a bar of ${b.seconds.toFixed(2)} s, volume ${e.vol}`);
      }
    };
    for (const name of Object.keys(CUES)) {
      let C;
      try { C = compileCue(name); } catch (e) { errors.push(e.message); continue; }
      for (let level = 0; level <= 3; level++) {
        for (const low of [false, true]) {
          const S = new Score(11 + level);
          S.setCue(name);
          const heard = new Set();
          for (let i = 0; i < 60; i++) {
            const b = S.nextBar(level, { low, rests: false });
            bars++;
            inRange(name, b);
            for (const e of b.events) heard.add(e.layer);
          }
          // nothing but the bed until the tune can start; then every layer whose turn it is
          const tune = level >= (C.layers.melody?.from ?? 1);
          const want = Object.keys(C.layers).filter((id) => (id === 'bed' || tune) && C.layers[id].from <= level && !(low && EXTRAS.includes(id)));
          expect([...heard].sort().join() === want.sort().join(), `cue ${name} at intensity ${level}${low ? ' on Low' : ''}: heard ${[...heard].sort().join(', ')}, expected ${want.join(', ')}`);
        }
      }
      // a statement, then a rest on the bed alone for about as long as the cue says
      const S = new Score(5);
      S.setCue(name);
      const rests = [];
      let run = 0, played = false;
      for (let t = 0; t < 1200; ) {
        const b = S.nextBar(2);
        t += b.seconds;
        if (b.phase === 'play') { if (played && run) rests.push(run); run = 0; played = true; } else { run += b.seconds; expect(b.layers.join() === (C.layers.bed ? 'bed' : ''), `cue ${name}: ${b.layers.join(', ') || 'nothing'} playing during a rest`); }
      }
      expect(rests.length >= 2, `cue ${name}: only ${rests.length} rests in twenty minutes`);
      for (const r of rests) expect(r >= C.rest[0] - 0.01 && r <= C.rest[1] + C.barSec, `cue ${name}: a rest of ${r.toFixed(0)} s, outside ${C.rest.join('-')} s`);
    }

    // changes of cue, on the bar line
    const keyOf = (a) => compileCue(a).key;
    const same = Object.keys(CUES).filter((a) => CUES[a].layers.bed && THEMES[CUES[a].theme]);
    const pair = (alike) => {
      for (const a of same) for (const b of same) if (a !== b && (keyOf(a) === keyOf(b)) === alike) return [a, b];
      return null;
    };
    const run = (from, to, n) => {
      const S = new Score(3), out = [];
      S.setCue(from);
      for (let i = 0; i < 4; i++) S.nextBar(2, { rests: false });
      S.setCue(to);
      for (let i = 0; i < n; i++) out.push(S.nextBar(2, { rests: false }));
      return out;
    };
    const near = pair(true), far = pair(false);
    if (near) {
      const [a, b] = near, out = run(a, b, 3), old = CUES[a].layers.bed.voice;
      expect(out[0].cue === b, `${a} to ${b} (the same key): the new cue should start on the next bar, not "${out[0].cue}"`);
      if (old !== CUES[b].layers.bed.voice) {
        expect(out[0].events.some((e) => e.voice === old) && out[1].events.some((e) => e.voice === old), `${a} to ${b}: the old bed (${old}) should die away under the new cue for two bars`);
        expect(!out[2].events.some((e) => e.voice === old && e.layer === 'bed'), `${a} to ${b}: the old bed (${old}) is still there in the third bar`);
      }
    }
    if (far) {
      const [a, b] = far, out = run(a, b, 3), ka = N.parseKey(keyOf(a)), kb = N.parseKey(keyOf(b));
      expect(out.map((x) => `${x.cue}:${x.phase}`).slice(0, 2).join() === `${a}:leaving,${a}:pivot` && out[2].cue === b, `${a} to ${b} (another key): expected a bar of bed, a pivot bar, then ${b}; got ${out.map((x) => `${x.cue}:${x.phase}`).join(', ')}`);
      expect(out[0].layers.join() === 'bed', `${a} to ${b}: the tune should drop out first`);
      for (const e of out[1].events) expect(ka.scale.includes(e.midi % 12) && kb.scale.includes(e.midi % 12), `${a} to ${b}: the pivot note ${N.noteName(e.midi)} is not in both keys`);
      inRange(`${a} to ${b}`, out[1]);
    }
    const first = Object.keys(CUES)[0];
    if (first) {
      const out = run(first, null, 3);
      expect(out[0].phase === 'out' && out[1].cue === null && !out[1].events.length, `${first} to silence: expected one bar going out, then nothing; got ${out.map((x) => `${x.cue}:${x.phase}`).join(', ')}`);
    }

    // a cue in another key than its theme's: every note moved by the same amount (or, in
    // another mode, to the same step of that mode), and still in the key
    for (const [name, Q] of Object.entries(CUES)) {
      if (!Q.key || errors.length) continue;
      const C = compileCue(name), T = THEMES[Q.theme], semis = N.noteMidi(Q.key.split(' ')[0] + '4') - N.noteMidi(T.key.split(' ')[0] + '4');
      const from = N.parseKey(T.key), moved = N.parseKey(Q.key.split(' ')[0] + ' ' + from.mode), mode = C.keyInfo.mode;
      for (const id of Q.form) {
        const was = N.parseTune(T.phrases[id].tune, T.steps).flat(), now = C.phrases[id].tune.flat();
        const step = (midi) => moved.scale.indexOf((((midi + semis) % 12) + 12) % 12);
        expect(now.every((n, i) => mode === from.mode ? (((n.midi - was[i].midi - semis) % 12) + 12) % 12 === 0 : C.keyInfo.scale.indexOf(n.midi % 12) === step(was[i].midi)), `cue ${name}: phrase ${id} is not its theme moved from ${T.key} to ${Q.key}`);
        for (const n of now) expect(C.keyInfo.scale.includes(n.midi % 12), `cue ${name}: ${N.noteName(n.midi)} is not in ${Q.key}`);
        for (const c of C.phrases[id].chords.flat()) expect(C.keyInfo.scale.includes(c.root), `cue ${name}: a chord on ${N.noteName(c.root + 60)} is not in ${Q.key}`);
      }
    }

    // colours. Rain: a major cue turns Dorian on the same note and every cue loses its
    // drums. Night: a calm cue slows, loses its drums and gains a celesta. A plain cue
    // has neither, and both are still in range.
    const isDrum = (e) => e.midi == null;
    let coloured = 0;
    for (const name of Object.keys(CUES)) {
      if (errors.length) break;
      const Q = CUES[name], C = compileCue(name);
      for (const colour of [{ rain: true }, { night: true }, { rain: true, night: true }]) {
        const V = compileCue(name, colour), S = new Score(9), heard = [];
        S.setCue(name);
        for (let i = 0; i < 40; i++) { const b = S.nextBar(3, { rests: false, ...colour }); bars++; inRange(`${name} (${Object.keys(colour).join(' and ')})`, b); heard.push(...b.events); expect(Math.abs(b.seconds - V.barSec) < 1e-9, `cue ${name}: a bar of ${b.seconds} s, not ${V.barSec}`); }
        const rain = colour.rain && !Q.plain, night = colour.night && !!Q.calm;
        if (rain || night) coloured++;
        expect(V.rain === !!rain && V.night === !!night, `cue ${name}: asked for ${JSON.stringify(colour)}, got rain ${V.rain}, night ${V.night}`);
        if (!rain && !night) { expect(V === C, `cue ${name} should have no colour for ${JSON.stringify(colour)}`); continue; }
        expect(!heard.some(isDrum), `cue ${name}, ${Object.keys(colour).join(' and ')}: the drums should drop out`);
        if (rain && C.keyInfo.mode === 'major') {
          expect(V.keyInfo.mode === 'dorian' && V.keyInfo.tonic === C.keyInfo.tonic, `cue ${name} in the rain: ${V.key}, expected the Dorian on the same note as ${C.key}`);
          expect(N.keyShift(V.key) === N.keyShift(C.key) - 2 || N.keyShift(V.key) === N.keyShift(C.key) + 10, `cue ${name} in the rain: one-shots would not follow it to ${V.key}`);
        }
        for (const e of heard) if (!isDrum(e) && e.layer !== 'melody' && e.layer !== 'descant' && e.layer !== 'night') expect(V.keyInfo.scale.includes(Math.round(e.midi) % 12), `cue ${name}, ${Object.keys(colour).join(' and ')}: ${N.noteName(e.midi)} (${e.layer}) is not in ${V.key}`);
        for (const n of Object.values(V.phrases).flatMap((P) => P.tune.flat())) expect(V.keyInfo.scale.includes(n.midi % 12), `cue ${name}, ${Object.keys(colour).join(' and ')}: the tune's ${N.noteName(n.midi)} is not in ${V.key}`);
        if (night) {
          expect(Math.abs(V.barSec - C.barSec / 0.85) < 1e-9, `cue ${name} at night should be slower`);
          expect(heard.some((e) => e.layer === 'night' && e.voice === 'celesta'), `cue ${name} at night should gain a celesta`);
        }
      }
    }
    expect(coloured >= 4, `only ${coloured} coloured versions of cues: the calm cues should have rain and night`);

    // the one-off phrases: over a cue in any key, every note on its instrument and in that key
    let stung = 0;
    for (const [id, S] of Object.entries(STINGS)) {
      const R = RANGES[S.voice];
      expect(R, `sting ${id}: no range for "${S.voice}"`);
      if (!R) continue;
      for (let tonic = 0; tonic < 12; tonic++) for (const mode of Object.keys(N.MODES)) {
        const key = N.noteName(60 + tonic).slice(0, -1) + ' ' + mode, K = N.parseKey(key);
        let notes;
        try { notes = stingNotes(id, key); } catch (e) { errors.push(e.message); break; }
        expect(notes.length > 0, `sting ${id}: no notes`);
        for (const n of notes) {
          stung++;
          expect(n.midi >= N.noteMidi(R[0]) && n.midi <= N.noteMidi(R[1]), `sting ${id} over ${key}: ${N.noteName(n.midi)} is outside the ${S.voice}'s range`);
          expect(K.scale.includes(n.midi % 12), `sting ${id} over ${key}: ${N.noteName(n.midi)} is not in the key`);
        }
      }
    }

    // the director: every cue it can ask for exists, and the table of situations, in priority order
    const zones = Z.SEA_ZONES.filter((r) => r.severity).map((r) => r.id);
    for (const band of Object.keys(Z.BANDS)) expect(CUES[cueFor({ band }).cue], `the ${band} band has no cue: cueFor gives "${cueFor({ band }).cue}"`);
    for (const zone of zones) for (const storm of [0, 1]) expect(CUES[cueFor({ band: 'open', zone, rough: 1, storm }).cue], `rough water (${zone}${storm ? ', in a storm' : ''}) has no cue: cueFor gives "${cueFor({ band: 'open', zone, rough: 1, storm }).cue}"`);
    expect(zones.length >= 3, `only ${zones.length} rough zones found in SEA_ZONES`);
    const clear = { band: 'coastal', fog: 1, storm: 0, rain: 0, night: 0, speed: 0 };
    for (const [s, cue, intensity] of [
      [{ band: 'home', speed: 0 }, 'home', 1],
      [{ band: 'coastal', speed: MUSIC.brisk + 1 }, 'coastal', 2],
      [{ band: 'open', speed: MUSIC.fast + 1 }, 'open', 3],
      [{ band: 'open', speed: -(MUSIC.fast + 1) }, 'open', 3],
      [{ band: 'home', ashore: true, speed: 0 }, null, 1],
      [{ ...clear, band: 'home' }, 'home', 1],
      [{ ...clear, storm: MUSIC.storm - 0.01 }, 'coastal', 1],
      [{ ...clear, storm: MUSIC.storm + 0.05, rain: 0.6, fog: 0.5 }, 'storm', 1],
      [{ ...clear, storm: 1, rain: 1, fog: 0.38 }, 'storm', 3],
      [{ ...clear, band: 'open', zone: 'reach', rough: 0.6 }, 'reach', 1],
      [{ ...clear, band: 'open', zone: 'reach', rough: 1 }, 'reach', 3],
      [{ ...clear, band: 'open', zone: 'reach', rough: 1, storm: 1, rain: 1, fog: 0.38 }, 'reach-storm', 3],
      [{ ...clear, band: 'open', zone: 'rip', rough: 1, fog: 0.18 }, 'rip', 3],
      [{ ...clear, fog: 0.18 }, 'fog', 1],
      [{ ...clear, fog: 0.39, rain: 0.5 }, 'coastal', 1],
      [{ ...clear, fog: 0.18, ghost: true }, 'ghost', 1],
      [{ ...clear, storm: 1, ghost: true }, 'ghost', 1],
      [{ ...clear, storm: 1, docked: true }, 'harbour', 2],
      [{ ...clear, band: 'home', docked: true, homePort: true }, 'haven', 2],
      [{ ...clear, band: 'home', title: true, docked: false }, 'title', 2],
      [{ ...clear, storm: 1, ashore: true }, null, 1],
      // Sable: above every weather, and ashore for the foot race
      [{ ...clear, sable: { kind: 'meet' } }, 'sable', 2],
      [{ ...clear, sable: { kind: 'race', start: true, lead: 0 } }, 'sable-race', 1],
      [{ ...clear, storm: 1, rain: 1, sable: { kind: 'race', lead: -60 } }, 'sable-race', 3],
      [{ ...clear, band: 'open', zone: 'reach', rough: 1, sable: { kind: 'race', lead: MUSIC.sableLead + 1 } }, 'sable-race', 2],
      [{ ...clear, fog: 0.18, sable: { kind: 'fog', lead: 0 } }, 'sable-fog', 2],
      [{ ...clear, ashore: true, sable: { kind: 'pacer', start: true } }, 'sable-pacer', 1],
      [{ ...clear, ashore: true, sable: { kind: 'pacer' } }, 'sable-pacer', 2],
      [{ ...clear, sable: { kind: 'tow', start: true } }, 'sable-tow', 1],
      [{ ...clear, band: 'home', night: 1, sable: { kind: 'tow' } }, 'sable-tow', 2],
      [{ ...clear, rain: 1, fog: 0.5, sable: { kind: 'kraken' } }, 'sable-kraken', 3],
      [{ ...clear, fog: 0.18, ghost: true, sable: null }, 'ghost', 1],
      [{ ...clear, title: true, sable: { kind: 'meet' } }, 'title', 2],
    ]) {
      const got = cueFor(s);
      expect(got.cue === cue && got.intensity === intensity, `cueFor(${JSON.stringify(s)}) gives ${got.cue} at ${got.intensity}, not ${cue} at ${intensity}`);
    }
    expect(cueFor({ ...clear, rain: 0.55 }).rain && !cueFor({ ...clear, rain: 0.1 }).rain && cueFor({ ...clear, night: 1 }).night && !cueFor(clear).night, 'cueFor: rain from MUSIC.rain up and night past dusk are colours');
    // a storm can't wait: a short hold, and one bar between keys instead of two
    expect(cueFor({ ...clear, storm: 1 }).urgent && cueFor({ ...clear, band: 'open', zone: 'reach', rough: 1, storm: 1 }).urgent && !cueFor(clear).urgent, 'cueFor: a storm is urgent, plain sea is not');
    for (const [urgent, secs] of [[true, MUSIC.urgentHold], [false, MUSIC.hold]]) {
      const H = new CueHold();
      H.update(0.1, 'coastal');
      let t = 0;
      while (H.update(0.1, 'storm', urgent) !== 'storm' && t < 60) t += 0.1;
      expect(Math.abs(t + 0.1 - secs) < 0.2, `CueHold took ${(t + 0.1).toFixed(1)} s to follow ${urgent ? 'an urgent' : 'an ordinary'} cue, not ${secs}`);
    }
    expect(MUSIC.urgentHold < MUSIC.hold / 2, 'MUSIC.urgentHold should be well under MUSIC.hold');
    // every Sable moment has its version of the theme; the races and the kraken can't wait for the hold
    for (const kind of ['meet', 'race', 'fog', 'pacer', 'tow', 'kraken']) {
      const got = cueFor({ ...clear, sable: { kind } }), Q = CUES[got.cue];
      expect(Q?.theme === 'sable', `Sable's ${kind}: cueFor gives "${got.cue}", which is not a version of Sable's theme`);
      expect(!Q || got.urgent === !!Q.urgent, `Sable's ${kind}: the director's hold (urgent ${got.urgent}) disagrees with the cue "${got.cue}" (urgent ${!!Q?.urgent})`);
    }
    for (const id of ['sable-horn', 'sable-won', 'sable-lost']) expect(STINGS[id], `no sting "${id}" for Sable`);
    if (CUES.storm && keyOf('storm') !== keyOf('coastal')) {
      const out = run('coastal', 'storm', 2);
      expect(CUES.storm.urgent && out[0].phase === 'pivot' && out[1].cue === 'storm', `coastal to storm: expected one pivot bar, then the storm; got ${out.map((x) => `${x.cue}:${x.phase}`).join(', ')}`);
    }
    // a ghost ship's cue has no bed: it rests in silence
    const hush = new Score(2);
    hush.setCue('ghost');
    let silent = 0;
    for (let i = 0; i < 60; i++) if (!hush.nextBar(1).events.length) silent++;
    expect(CUES.ghost && !CUES.ghost.layers.bed && silent > 10, `the ghost ship's cue should rest in silence (${silent} silent bars in 60)`);

    // ten minutes back and forth across the edge of home waters, yawing as she goes
    let edge = 0;
    while (Z.bandAt(edge, 0) === 'home' && edge < 1e5) edge += 5;
    const hold = new CueHold(), dt = 0.1, leg = 37.5;
    let raw = 0, changes = 0, lastBand = null, lastCue = null;
    for (let t = 0; t < 600; t += dt) {
      const band = Z.bandAt(edge + 300 * Math.sin((Math.PI * t) / leg) + 25 * Math.sin(t * 5.65), 0);
      const cue = hold.update(dt, cueFor({ band }).cue);
      if (lastBand && band !== lastBand) raw++;
      if (lastCue && cue !== lastCue) changes++;
      lastBand = band; lastCue = cue;
    }
    const legs = Math.round(600 / leg);
    expect(raw > legs, `the band-edge sail only crossed the edge ${raw} times in ${legs} legs: it isn't testing the hold`);
    expect(changes <= legs, `the music changed ${changes} times in ${legs} crossings of the home waters' edge (the band itself flipped ${raw} times)`);
    expect(changes >= legs - 2, `the music only changed ${changes} times in ${legs} crossings: it should follow the boat across`);
    const quick = new CueHold();
    quick.update(0.1, 'home');
    expect(quick.update(0.1, null) === null && quick.update(0.1, 'open') === 'open', 'CueHold: silence (going ashore) and the first cue after it are taken at once');

    return { errors, note: `${Object.keys(THEMES).length} themes, ${Object.keys(CUES).length} cues, ${coloured} more in the rain or at night, ${bars} bars played on paper, ${Object.keys(STINGS).length} stings in every key (${stung} notes); ${changes} changes of cue in ${legs} crossings of a band's edge, where the band flipped ${raw} times` };
  },

  // The sea zones (sea-zones.js): home waters hold Port Haven and grandfather's
  // wreck, the bands lie where the plan puts them, nothing jumps as you sail
  // across a fade, and the shaders get the same table as the CPU. Rough water
  // lies round its landmark and leaves a calm pocket for the whole island and
  // the water you land from; it covers no port, and has one within reach.
  async seazones() {
    const errors = [];
    const Z = await load('sea-zones.js');
    const { WAVE_GLSL, updateWaves, waveHeight, setSeaOrigin } = await load('waves.js');
    const { ROUGH, REFITS, LAND_RANGE, WORLD_HALF } = await load('config.js');
    const { SEAS } = await load('story-text.js');
    const home = Z.SEA_ZONES.find((r) => r.id === 'home');
    if (!home || Z.SEA_ZONES[0] !== home) return { errors: ['home waters must be the first row of SEA_ZONES (bandAt reads it)'], note: 'no home' };

    // Port Haven, and everywhere the wreck can be placed: world.js needs three.js, so
    // its numbers are read from the source (placeWreck: d = H.r + a + rng() * b).
    const world = source[join(SRC, 'world.js')];
    const haven = world.match(/add\(\{ x: 0, z: 0, r: (\d+)[^\n]*port: true/)?.[1];
    const put = world.match(/const d = H\.r \+ (\d+) \+ rng\(\) \* (\d+);/);
    const bound = world.match(/wreck: true,[^;]*?bound: (\d+)/s)?.[1];
    if (!haven || !put || !bound) errors.push("world.js: can't find Port Haven's radius or where the wreck is placed (update this check)");
    else {
      const far = Number(haven) + Number(put[1]) + Number(put[2]) + Number(bound);
      for (let a = 0; a < 16; a++) {
        const x = Math.cos(a) * far, z = Math.sin(a) * far, S = Z.seaAt(x, z);
        if (S.shallow < 1 || S.zone !== 'home' || Z.bandAt(x, z) !== 'home') { errors.push(`the wreck can lie ${far} m from Port Haven, which is not fully inside home waters`); break; }
      }
    }
    const at0 = Z.seaAt(0, 0);
    if (at0.shallow !== 1 || at0.zone !== 'home' || at0.wave !== home.wave || at0.swell !== home.swell) errors.push(`Port Haven is not in home waters: ${JSON.stringify(at0)}`);

    // bands: home, then the coastal sea, then the open sea, where every landmark lies
    const bands = [[0, 'home'], [home.outer, 'home'], [home.outer + home.fade, 'coastal'], [Z.OPEN_SEA - 1, 'coastal'], [Z.OPEN_SEA, 'open'], [6000, 'open']];
    for (const [d, want] of bands) if (Z.bandAt(0, d) !== want || Z.bandAt(-d, 0) !== want) errors.push(`${d} m from Port Haven should be ${want}, not ${Z.bandAt(0, d)}`);
    const plain = Z.seaAt(home.outer + home.fade + 1, 0);
    if (plain.shallow || plain.rough || plain.zone || plain.wave !== 1 || plain.swell !== 1 || plain.floor || plain.open) errors.push(`past the fade the sea should be plain: ${JSON.stringify(plain)}`);
    // the hand-placed islands, read from world.js: the landmarks, then the ports
    const marks = [...world.matchAll(/add\(\{ x: (-?\d+), z: (-?\d+), r: (\d+),[^\n]*landmark: '(\w+)', name: '([^']+)'/g)].map((m) => ({ x: +m[1], z: +m[2], r: +m[3], landmark: m[4], name: m[5] }));
    const ports = [...(world.match(/const ports = \[([\s\S]*?)\];\n/)?.[1] || '').matchAll(/\[(-?\d+), (-?\d+), '([^']+)'\]/g)].map((m) => ({ x: +m[1], z: +m[2], name: m[3] }));
    const portR = world.match(/add\(\{ x: px, z: pz, r: (\d+) \+ rng\(\) \* (\d+), port: true/);
    const fit = world.match(/< \(I\.r \+ r\) \* ([\d.]+) \+ (\d+)\) return false/), tryR = world.match(/!fits\(px, pz, (\d+)\)/)?.[1];
    const edgeK = Number(world.match(/bound: r \* ([\d.]+),/)?.[1]); // an island reaches this many radii out
    if (marks.length !== 5 || ports.length !== 8 || !portR || !fit || !tryR || !edgeK || !haven) errors.push("world.js: can't find the landmarks, the ports or how islands are fitted (update this check)");
    for (const M of marks) if (Z.bandAt(M.x, M.z) !== 'open') errors.push(`${M.name} is not in the open sea`);
    // a port is only moved if it doesn't fit where it is written: none should need to, so they are where world.js says
    const biggest = Number(portR?.[1]) + Number(portR?.[2]);
    const placed = [{ x: 0, z: 0, r: Number(haven) }, ...marks];
    for (const P of ports) {
      const near = placed.find((I) => Math.hypot(I.x - P.x, I.z - P.z) < (I.r + Number(tryR)) * Number(fit?.[1]) + Number(fit?.[2]));
      if (near) errors.push(`${P.name} doesn't fit where world.js writes it (too near ${near.name || 'another port'}), so it is somewhere this check can't know`);
      placed.push({ ...P, r: biggest });
    }

    // ---- rough water
    const rough = Z.SEA_ZONES.filter((R) => R.severity);
    const range = Math.max(LAND_RANGE, ...REFITS.map((R) => R.range || 0)); // the furthest off you can drop anchor
    const round = (x, z, r, n = 48) => [[x, z], ...Array.from({ length: n }, (_, a) => [x + Math.cos((a / n) * Math.PI * 2) * r, z + Math.sin((a / n) * Math.PI * 2) * r])];
    const cheb = (P) => Math.max(Math.abs(P.x), Math.abs(P.z));
    const worstOf = (R) => (R.edge ? [300, R.inner + 150] : [R.x + (R.inner + R.outer) / 2, R.z]);
    Z.placeSeaZones(marks); // as main.js does with the world's own islands
    const firstEdge = Z.SEA_ZONES.findIndex((R) => R.edge);
    if (firstEdge !== -1 && Z.SEA_ZONES.slice(firstEdge).some((R) => !R.edge)) errors.push('edge bands must be the last rows of SEA_ZONES (they give way to the pockets of the rings before them)');
    for (const R of Z.SEA_ZONES) if (!SEAS[R.id]) errors.push(`${R.id}: no name in SEAS (story-text.js)`);
    for (const key of ['rough', 'reef', 'beating']) if (!SEAS[key]) errors.push(`SEAS.${key} is missing (story-text.js)`);
    for (const R of rough) {
      const name = SEAS[R.id] || R.id;
      if (!(ROUGH.floor[R.severity] > 0 && ROUGH.wear[R.severity] > 0)) errors.push(`${name}: severity ${R.severity} has no swell floor or wear in ROUGH (config.js)`);
      if (ROUGH.floor[R.severity] < 0.4) errors.push(`${name}: a swell floor of ${ROUGH.floor[R.severity]} is under the 0.4 a bow slam needs (game.js, checkBowSlam)`);
      const at = Z.seaAt(...worstOf(R));
      if (at.rough !== 1 || at.severity !== R.severity || at.roughZone !== R.id || at.zone !== R.id || Math.abs(at.floor - ROUGH.floor[R.severity]) > 1e-9) errors.push(`${name}: its worst water should be fully rough: ${JSON.stringify(at)}`);
      if (R.edge) {
        // a band along the edge: full from before the edge's current (boat.js) to the edge, and a port within 2,000 m of where it starts
        const current = WORLD_HALF - Number(source[join(SRC, 'boat.js')].match(/const edge = WORLD_HALF - (\d+);/)?.[1]);
        if (!(R.inner <= current && R.outer >= WORLD_HALF)) errors.push(`${name}: should be full from before the edge's current (${current} m) to the edge`);
        const gap = Math.min(...ports.map((P) => R.inner - (R.fadeIn ?? R.fade) - cheb(P)));
        if (!(gap <= 2000)) errors.push(`${name}: the nearest port is ${Math.round(gap)} m short of it; one should be within 2,000 m (move the zone, never a port)`);
        continue;
      }
      // a ring round a landmark: centred on it, as world.js places it
      const M = marks.find((m) => m.landmark === R.landmark);
      if (!M) { errors.push(`${name}: no island in world.js has landmark '${R.landmark}'`); continue; }
      const T = source[join(SRC, 'sea-zones.js')].match(new RegExp(`id: '${R.id}', landmark: '${R.landmark}', x: (-?\\d+), z: (-?\\d+),`));
      if (!T || +T[1] !== M.x || +T[2] !== M.z) errors.push(`${name}: the table's centre is not where world.js puts ${M.name} (${M.x}, ${M.z})`);
      // its calm pocket holds the whole island and the water you land from
      const reach = M.r * edgeK + range, pocket = R.inner - (R.fadeIn ?? R.fade);
      if (reach > pocket) errors.push(`${name}: the calm pocket ends ${pocket} m from ${M.name}, inside its shore plus landing range (${Math.round(reach)} m)`);
      for (const [x, z] of round(M.x, M.z, reach)) {
        const S = Z.seaAt(x, z);
        if (S.rough || S.floor || S.wave !== 1) { errors.push(`${name}: rough water at ${Math.round(x)}, ${Math.round(z)}, inside ${M.name}'s landing range (${JSON.stringify(S)})`); break; }
      }
      // a port within 2,000 m of its outer edge, to repair before and after
      const gap = Math.min(...ports.map((P) => Math.hypot(P.x - M.x, P.z - M.z) - (R.outer + R.fade)));
      if (!(gap <= 2000)) errors.push(`${name}: the nearest port is ${Math.round(gap)} m from its outer edge; one should be within 2,000 m (move the zone, never a port)`);
    }
    // no rough water over a port: the island at its biggest, its dock and the water you dock from
    for (const P of [{ x: 0, z: 0, name: 'Port Haven' }, ...ports]) {
      const hit = round(P.x, P.z, biggest * edgeK + 100).map(([x, z]) => Z.seaAt(x, z)).find((S) => S.rough > 0);
      if (hit) errors.push(`${P.name} is in rough water (${SEAS[hit.roughZone]})`);
    }
    // the open sea's darker water: none on the coast, all of it out by the landmarks, none past the world
    if (Z.openSea(Z.OPEN_SEA - 500) !== 0 || Z.openSea(Z.OPEN_SEA + 500) !== 1 || Z.openSea(WORLD_HALF * 1.42) !== 1 || Z.openSea(100000) !== 0 || Z.seaAt(100000, 0).open !== 0) errors.push('the open sea should darken across its start, hold to the corners of the world and end beyond them');
    // treasure and salvage are worth more in rough water, by how far in they lie, and nowhere else
    for (const R of rough) if (Math.abs(Z.goldBonus(...worstOf(R)) - ROUGH.gold) > 1e-9) errors.push(`${SEAS[R.id]}: a find in its worst water should be worth ${ROUGH.gold} times as much`);
    if (!(ROUGH.gold > 1) || Z.goldBonus(0, 0) !== 1 || Z.goldBonus(2400, 300) !== 1 || marks.some((M) => Z.goldBonus(M.x + M.r, M.z) !== 1)) errors.push('a find should be worth more in rough water only: not at home, in plain sea or off a landmark in its calm pocket');
    const gameSrc = source[join(SRC, 'game.js')];
    if (!/goldBonus\(I\.treasure\.x, I\.treasure\.z\)/.test(gameSrc) || !/value: Math\.round\([^\n]*goldBonus\(x, z\)\)/.test(gameSrc) || !SEAS.haul) errors.push('game.js should price treasure (haulTreasure) and salvage (updateFlotsam) with goldBonus(), and say so (SEAS.haul)');
    // races and the kraken's trench keep out (race.js needs three.js, so its source is read)
    if (!/function clearAt[^}]*raceWater\(x, z\)/s.test(source[join(SRC, 'race.js')]) || !/!raceWater\(/.test(source[join(SRC, 'rival.js')])) errors.push('race.js (clearAt) and rival.js (the Deep) should both ask raceWater()');

    // fades are wide, and nothing steps as you cross one
    const k = [1, 1, 0];
    for (const R of Z.SEA_ZONES) {
      if (R.fade < 200 || (R.fadeIn ?? R.fade) < 200) errors.push(`${R.id}: a fade of ${Math.min(R.fade, R.fadeIn ?? R.fade)} m is under 200 m`);
      let last = [...Z.waveFactors(R.x, R.z, k)], worst = 0;
      for (let d = 1; d <= R.outer + R.fade + 50; d++) { const v = Z.waveFactors(R.x + d, R.z, k); worst = Math.max(worst, ...v.map((n, j) => Math.abs(n - last[j]))); last = [...v]; }
      if (worst > 0.008) errors.push(`${R.id}: the waves step by ${worst.toFixed(4)} in one metre`);
    }

    // the waves themselves: half as tall at home as the same water out on the coast
    updateWaves(12, 1, 0.6);
    for (const [x, z] of [[10, 20], [-300, 440], [640, -80]]) {
      setSeaOrigin(0, 0);
      const here = waveHeight(x, z);
      setSeaOrigin(1e5, 0);
      const away = waveHeight(x, z);
      if (Math.abs(here - away * home.wave) > 1e-9 || Math.abs(away) < 1e-6) errors.push(`waveHeight at ${x}, ${z}: ${here.toFixed(3)} at home, ${away.toFixed(3)} outside; expected ${home.wave} of it`);
    }
    // …and in rough water under a clear sky there is a swell all the same: its floor, however fair the weather
    for (const R of rough) {
      setSeaOrigin(...worstOf(R));
      updateWaves(12, 0, 0);
      const fair = waveHeight(7, 31);
      updateWaves(12, 0, 0, 0.35); // ashore, only part of the floor is let through
      const ashore = waveHeight(7, 31);
      setSeaOrigin(1e5, 0);
      updateWaves(12, 0, ROUGH.floor[R.severity]);
      const stormy = waveHeight(7, 31);
      if (Math.abs(fair - stormy) > 1e-9 || Math.abs(fair) < 1e-6) errors.push(`${R.id}: with no swell from the weather the sea should stand at its floor (${fair.toFixed(3)}, expected ${stormy.toFixed(3)})`);
      if (Math.abs(ashore - fair * 0.35) > 1e-9) errors.push(`${R.id}: updateWaves(…, floor) should scale the swell's floor`);
    }
    updateWaves(12, 1, 0.6);
    setSeaOrigin(0, 0);

    // the weather's odds: no storm starts at home, and the bands rank as they should
    const draw = (band) => { const n = { storm: 0, rain: 0, cloudy: 0 }; for (let i = 0; i < 3000; i++) n[Z.pickByBand(['storm', 'rain', 'cloudy', 'storm'], band, (i + 0.5) / 3000)]++; return n; };
    const odds = { home: draw('home'), coastal: draw('coastal'), open: draw('open') };
    if (odds.home.storm) errors.push('a storm can start in home waters');
    const per = (n, type) => n[type] / n.cloudy; // against a weather no band touches
    if (!(per(odds.open, 'storm') > per(odds.coastal, 'storm') && per(odds.home, 'rain') < per(odds.coastal, 'rain') && per(odds.coastal, 'rain') < per(odds.open, 'rain'))) errors.push(`weather odds by band are out of order: ${JSON.stringify(odds)}`);
    if (odds.coastal.storm !== 1500 || odds.coastal.rain !== 750) errors.push("the coastal sea should leave weather.js's table as it is");
    for (const [band, B] of Object.entries(Z.BANDS)) if (!(B.stormFor?.[0] > 0 && B.stormFor[1] > B.stormFor[0])) errors.push(`BANDS.${band}: stormFor needs a shortest and a longest storm`);

    // the shaders: the waves include the zone code, with one line a zone that says what the table says.
    // Each line is read back and worked out by hand, then compared with the CPU all over the map.
    const glsl = Z.SEA_ZONE_GLSL;
    if (!WAVE_GLSL.includes(glsl) || !/waveHeightK\(p, seaWaveK\(p\)\)/.test(WAVE_GLSL) || !WAVE_GLSL.includes('float swellAt(vec3 k) { return max(uSwellScale * k.y, k.z); }')) errors.push('WAVE_GLSL does not include the sea zones (SEA_ZONE_GLSL, seaWaveK, swellAt)');
    if (!glsl.includes(`uniform vec2 uSeaZone[${Z.SEA_ZONES.length}];`) || Z.ZONE_AT.length !== Z.SEA_ZONES.length * 2 || !glsl.includes('k.z *= uSeaFloor;')) errors.push('uSeaZone does not have one centre for each zone, or the floor is not scaled by uSeaFloor');
    const num = '(-?[\\d.]+)';
    const line = new RegExp(`d = (distance\\(w, uSeaZone\\[(\\d+)\\]\\)|max\\(abs\\(w\\.x - uSeaZone\\[(\\d+)\\]\\.x\\), abs\\(w\\.y - uSeaZone\\[\\d+\\]\\.y\\)\\)); s = (?:smoothstep\\(${num}, ${num}, d\\) \\* )?\\(1\\.0 - smoothstep\\(${num}, ${num}, d\\)\\)( \\* calm)?;`
      + `(?: k\\.xy \\*= mix\\(vec2\\(1\\.0\\), vec2\\(${num}, ${num}\\), s\\);)?(?: look\\.x = max\\(look\\.x, ${num} \\* s\\);)?(?: k\\.z = max\\(k\\.z, ${num} \\* s\\); look\\.y = max\\(look\\.y, ${num} \\* s\\);)?(?: calm \\*= smoothstep\\(${num}, ${num}, d\\);)? // (\\w+)`, 'g');
    const lines = [...glsl.matchAll(line)].map((m) => {
      const n = (v) => (v == null ? null : Number(v));
      return { edge: m[3] != null, i: n(m[2] ?? m[3]), in0: n(m[4]), in1: n(m[5]), out0: n(m[6]), out1: n(m[7]), calm: !!m[8], wave: n(m[9]), swell: n(m[10]), shallow: n(m[11]), floor: n(m[12]), look: n(m[13]), p0: n(m[14]), p1: n(m[15]), id: m[16] };
    });
    if (lines.length !== Z.SEA_ZONES.length) errors.push(`the shader has ${lines.length} zone lines for ${Z.SEA_ZONES.length} zones`);
    const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    lines.forEach((L, row) => {
      const R = Z.SEA_ZONES[L.i];
      if (!R || R.id !== L.id || L.i !== row) { errors.push(`shader zone line ${row} is "${L.id}" (uSeaZone[${L.i}]), the table says "${Z.SEA_ZONES[row]?.id}"`); return; }
      const fin = R.fadeIn ?? R.fade, pocket = !!R.severity && R.inner > 0 && !R.edge;
      const same = L.edge === !!R.edge && L.calm === !!R.edge && L.out0 === R.outer && L.out1 === R.outer + R.fade && (R.inner > 0 ? L.in0 === R.inner - fin && L.in1 === R.inner : L.in0 == null)
        && (L.wave ?? 1) === R.wave && (L.swell ?? 1) === R.swell && (L.shallow ?? 0) === (R.shallow || 0)
        && (R.severity ? L.floor === ROUGH.floor[R.severity] && Math.abs(L.look - R.severity / 3) < 1e-6 : L.floor == null)
        && (pocket ? L.p0 === R.inner - fin && L.p1 === R.inner : L.p0 == null);
      if (!same) errors.push(`${R.id}: the shader's numbers are not the table's`);
    });
    // the shader's lines, run as the graphics card would
    const shaderSea = (x, z) => {
      let wave = 1, swell = 1, floor = 0, shallow = 0, calm = 1;
      for (const L of lines) {
        const cx = Z.ZONE_AT[L.i * 2], cz = Z.ZONE_AT[L.i * 2 + 1];
        const d = L.edge ? Math.max(Math.abs(x - cx), Math.abs(z - cz)) : Math.hypot(x - cx, z - cz);
        const sK = (L.in0 == null ? 1 : sstep(L.in0, L.in1, d)) * (1 - sstep(L.out0, L.out1, d)) * (L.calm ? calm : 1);
        if (L.wave != null) { wave *= 1 + (L.wave - 1) * sK; swell *= 1 + (L.swell - 1) * sK; }
        if (L.shallow != null) shallow = Math.max(shallow, L.shallow * sK);
        if (L.floor != null) floor = Math.max(floor, L.floor * sK);
        if (L.p0 != null) calm *= sstep(L.p0, L.p1, d);
      }
      return [wave, swell, floor, shallow];
    };
    let compared = 0;
    compare: for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 125) for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 125) {
      const gpu = shaderSea(x, z), S = Z.seaAt(x, z), cpu = [...Z.waveFactors(x, z, k), S.shallow];
      compared++;
      if (gpu.some((v, j) => Math.abs(v - cpu[j]) > 1e-6) || cpu[0] !== S.wave || cpu[1] !== S.swell || cpu[2] !== S.floor) { errors.push(`the shader and the CPU disagree at ${x}, ${z}: ${gpu.map((v) => v.toFixed(4))} and ${cpu.map((v) => v.toFixed(4))}`); break compare; }
    }
    const openLine = glsl.match(new RegExp(`look\\.z = smoothstep\\(${num}, ${num}, d\\) \\* \\(1\\.0 - smoothstep\\(${num}, ${num}, d\\)\\);`));
    if (!openLine) errors.push('the shader has no line for the open sea (look.z)');
    else for (let d = 0; d <= 12000; d += 50) if (Math.abs(sstep(+openLine[1], +openLine[2], d) * (1 - sstep(+openLine[3], +openLine[4], d)) - Z.openSea(d)) > 1e-6) { errors.push(`the open sea: the shader and the CPU disagree ${d} m out`); break; }
    const ocean = source[join(SRC, 'ocean.js')];
    for (const need of ['seaZones(wp.xz, seaK, seaLook)', 'swellAt(vSeaK)', 'clearShallows(', 'rough * 0.2']) if (!ocean.includes(need)) errors.push(`ocean.js no longer has ${need}`);
    return { errors, note: `${Z.SEA_ZONES.length} zones (${Z.SEA_ZONES.map((r) => r.id).join(', ')}), home waters to ${home.outer}-${home.outer + home.fade} m, open sea from ${Z.OPEN_SEA} m, ${rough.length} rough zones clear of all ${ports.length + 1} ports; the shader and the CPU agree at ${compared} points` };
  },

  // Rough water's hazards (rogue.js; the ridge is in waves.js): the rogue wave is the
  // same on the CPU as in the shaders, comes when and from where it should, always
  // reaches the boat, and costs a share of the hull by how it was met; the steady wear
  // goes by the metre; the growlers lie only in the Reach, clear of its calm pocket;
  // fog gathers there; and on paper one crossing of the Reach costs each of the plan's
  // three boats about what the plan asks (the real table is measured in the game, by
  // tidewake.debug.cross).
  async rogue() {
    const errors = [];
    const { ROGUE, ROUGH, GROWLERS, UPGRADES } = await load('config.js');
    const Wv = await load('waves.js');
    const R = await load('rogue.js');
    const Z = await load('sea-zones.js');
    const { SEAS } = await load('story-text.js');
    const { mulberry32 } = await load('util.js');
    const expect = (ok, what) => { if (!ok) errors.push(what); };
    const rng = mulberry32(930);
    const reach = Z.SEA_ZONES.find((r) => r.id === 'reach'), rip = Z.SEA_ZONES.find((r) => r.id === 'rip');
    const worst = [reach.x + (reach.inner + reach.outer) / 2, reach.z];

    // ---- the ridge: the shader's lines, read back and run by hand, against the CPU
    const G = Wv.WAVE_GLSL, num = '(-?[\\d.]+)';
    const widths = G.match(new RegExp(`float w = a > 0\\.0 \\? ${num} : ${num};`));
    const taper = G.match(new RegExp(`float h = uRogueH \\* exp\\(-a \\* a / \\(w \\* w\\)\\) \\* \\(1\\.0 - smoothstep\\(${num}, ${num}, abs\\(b\\)\\)\\);`));
    const framed = G.includes('if (uRogueH <= 0.0) return vec3(0.0);') && G.includes('vec2 q = p + uSeaOrigin - uRogue.xy;')
      && G.includes('float a = dot(q, uRogue.zw); float b = dot(q, vec2(-uRogue.w, uRogue.z));') && G.includes('+ hs * swellAt(k) + rogueWave(p).x;');
    let compared = 0;
    if (!widths || !taper || !framed) errors.push('WAVE_GLSL: the rogue wave is not written as this check reads it (rogueWave, added in waveHeightK)');
    else {
      const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const gpu = (px, pz) => {
        const u = Wv.waveUniforms, r = u.uRogue.value, o = u.uSeaOrigin.value;
        if (u.uRogueH.value <= 0) return 0;
        const qx = px + o[0] - r[0], qz = pz + o[1] - r[1];
        const a = qx * r[2] + qz * r[3], b = qx * -r[3] + qz * r[2], w = a > 0 ? +widths[1] : +widths[2];
        return u.uRogueH.value * Math.exp((-a * a) / (w * w)) * (1 - sstep(+taper[1], +taper[2], Math.abs(b)));
      };
      Wv.updateWaves(7, 0.35, 0);
      shader: for (const [ox, oz] of [[0, 0], worst, [3100, -420]]) {
        for (let k = 0; k < 6; k++) {
          const ang = rng() * 6.283, cx = ox + (rng() - 0.5) * 80, cz = oz + (rng() - 0.5) * 80, tall = 1 + rng() * 7;
          Wv.setSeaOrigin(ox, oz);
          for (let i = 0; i < 300; i++) {
            const x = (rng() - 0.5) * 320, z = (rng() - 0.5) * 320;
            Wv.setRogueWave();
            const flat = Wv.waveHeight(x, z);
            Wv.setRogueWave(cx, cz, Math.cos(ang), Math.sin(ang), tall);
            const cpu = Wv.waveHeight(x, z) - flat, g = gpu(x, z);
            compared++;
            if (Math.abs(cpu - g) > 1e-6 || Math.abs(cpu - Wv.rogueHeight(x + ox, z + oz)) > 1e-9) { errors.push(`the rogue wave: the shader and the CPU disagree at ${x.toFixed(0)}, ${z.toFixed(0)} (${g.toFixed(4)} and ${cpu.toFixed(4)})`); break shader; }
          }
        }
      }
      Wv.setRogueWave(40, 0, 1, 0, ROGUE.height);
      Wv.setSeaOrigin(0, 0);
      expect(Math.abs(Wv.rogueHeight(40, 0) - ROGUE.height) < 1e-9 && Wv.rogueHeight(40 + ROGUE.front, 0) < Wv.rogueHeight(40 - ROGUE.front, 0), 'the ridge should be full height on its crest line, and steeper in front than behind');
      expect(Wv.rogueHeight(40, ROGUE.reach[0] - 1) === ROGUE.height && Wv.rogueHeight(40, ROGUE.reach[1] + 1) === 0, 'the ridge should be full height along its crest to ROGUE.reach[0], and gone by ROGUE.reach[1]');
      Wv.setRogueWave();
      expect(Wv.rogueHeight(40, 0) === 0 && Wv.waveUniforms.uRogueH.value === 0, 'setRogueWave() with nothing should leave no wave');
    }
    const ocean = source[join(SRC, 'ocean.js')];
    for (const need of ['vec3 rogue = rogueWave(p);', 'if (rogue.x > 0.0)', 'rogueDark']) if (!ocean.includes(need)) errors.push(`ocean.js no longer has ${need} (the rogue wave's look)`);

    // ---- when they come
    for (let i = 0; i < 300; i++) {
      for (const sev of [1, 2, 3]) {
        const t = R.rogueGap(sev, rng), first = R.rogueGap(sev, rng, true);
        const k = ROGUE.every[sev][0] / ROGUE.every[3][0]; // a gentler zone's first wave waits as much longer as its waves are rarer
        expect(t >= ROGUE.every[sev][0] && t <= ROGUE.every[sev][1] && first >= ROGUE.first[0] * k && first <= ROGUE.first[1] * k && first < ROGUE.every[sev][0], `severity ${sev}: a gap of ${t.toFixed(0)} s (first ${first.toFixed(0)} s) is outside ROGUE.every and ROGUE.first`);
      }
      if (errors.length > 10) break;
    }
    expect(R.rogueGap(0, rng) === Infinity && R.rogueGap(0, rng, true) === Infinity, 'plain sea should have no rogue waves');
    expect(ROGUE.every[3][0] === 20 && ROGUE.every[3][1] === 40, 'the Reach should have a rogue wave every 20-40 s (the plan)');
    expect(ROGUE.every[2][0] >= ROGUE.every[3][1] && ROGUE.every[1][0] >= ROGUE.every[2][1] && ROGUE.size[1] < ROGUE.size[2] && ROGUE.size[2] < ROGUE.size[3], 'rogue waves should be rarer and smaller at lower severity');
    expect(ROGUE.first[1] < ROGUE.every[3][0] && ROGUE.rise <= ROGUE.warn && ROGUE.rise >= 3.5 && ROGUE.rise <= 4.5, 'the first wave should come sooner than the rest, and a wave should take about 4 s to rise, no longer than its warning');

    // ---- where from, and that it arrives: boats of every speed, sailing on, running before it, and running along it
    const stb = (h) => [-Math.cos(h), Math.sin(h)]; // starboard, as boat.js has it
    for (let i = 0; i < 400 && errors.length < 10; i++) {
      const h = rng() * 6.283, v = rng() * 30, start = { x: (rng() - 0.5) * 9000, z: (rng() - 0.5) * 9000, heading: h, vx: Math.sin(h) * v, vz: Math.cos(h) * v };
      const W = R.launchRogue(start, rng, 3);
      const off = Math.abs(W.rel), [sx, sz] = stb(h);
      expect(off >= ROGUE.off[0] && off <= ROGUE.off[1], `a wave launched ${off.toFixed(2)} rad off the bow: outside ROGUE.off`);
      expect(Math.sign(-W.dx * sx - W.dz * sz) === Math.sign(W.rel) && W.side.startsWith(W.rel > 0 ? 'starboard' : 'port'), 'a wave from a positive bearing should come from starboard, and be called so');
      expect(Math.abs(Math.hypot(W.dx, W.dz) - 1) < 1e-9 && W.full === ROGUE.height && W.h === 0, 'a new wave should have a unit direction, the full height to grow to, and no height yet');
      // three ways to sail once it is called
      const ways = { on: [start.vx, start.vz], 'before it': [W.dx * 30, W.dz * 30], 'along it': [-W.dz * 30, W.dx * 30] };
      for (const [way, [vx, vz]] of Object.entries(ways)) {
        const w = { ...W }, b = { x: start.x, z: start.z, vx, vz };
        let t = 0, struck = false;
        while (!w.done && t < 40) { b.x += vx / 60; b.z += vz / 60; t += 1 / 60; if (R.stepRogue(w, 1 / 60, b)) { struck = t; break; } }
        if (!struck) errors.push(`a boat sailing ${way} at ${Math.hypot(vx, vz).toFixed(0)} m/s was never reached by its wave`);
        else if (way === 'on' && Math.abs(struck - ROGUE.warn) > 0.15) errors.push(`a boat sailing on was reached after ${struck.toFixed(2)} s, not the ${ROGUE.warn} s of warning`);
        else if (struck < ROGUE.rise * 0.75 || w.hitK < 0.8 || struck > ROGUE.warn * 5) errors.push(`a boat sailing ${way} was struck after ${struck.toFixed(1)} s, ${w.hitK.toFixed(2)} squarely: it should have fair warning and be caught under the crest`);
      }
    }
    // it runs out afterwards, and is never left standing
    const still = { x: 0, z: 0, heading: 0, vx: 0, vz: 0 }, gone = R.launchRogue(still, rng, 3, 0.8);
    let life = 0, strikes = 0, top = 0;
    while (!gone.done && life < 60) { strikes += R.stepRogue(gone, 1 / 60, still) ? 1 : 0; top = Math.max(top, gone.h); life += 1 / 60; expect(gone.h >= 0, 'a wave below the sea'); }
    expect(gone.done && gone.h === 0 && strikes === 1 && Math.abs(top - ROGUE.height) < 0.01 && Math.abs(life - ROGUE.warn - ROGUE.fade) < 0.2, `a wave should rise, strike once and be gone ${ROGUE.fade} s later (${life.toFixed(1)} s, ${strikes} strikes, ${top.toFixed(1)} m)`);
    expect(R.launchRogue(still, rng, 1).full < R.launchRogue(still, rng, 3).full, 'a gentler zone should have smaller waves');
    // the words: one for every way it can lie, and the right hand
    for (let rel = -3.14; rel <= 3.14; rel += 0.02) {
      const key = R.bearingKey(rel), text = SEAS.wave?.[key];
      if (!text || (/port|starboard/.test(key) && !text.includes(rel < 0 ? 'port' : 'starboard')) || (rel < 0 ? text.includes('▶') : text.includes('◀'))) { errors.push(`SEAS.wave.${key} is missing or names the wrong side`); break; }
    }
    expect(R.bearingKey(0.2) === 'ahead' && R.bearingKey(-0.2) === 'ahead' && R.bearingKey(0.8) === 'starboardBow' && R.bearingKey(-1.6) === 'portBeam' && R.bearingKey(2.4) === 'starboardQuarter' && R.bearingKey(3) === 'astern', 'bearingKey names the bearings wrongly');
    for (const key of ['waveOver', 'waveBeam', 'waveSail']) expect(SEAS[key], `SEAS.${key} is missing (story-text.js)`);

    // ---- what a strike costs: a share of the hull, by how it was met
    const wave = (rel) => { const w = R.launchRogue({ x: 0, z: 0, heading: 0, vx: 0, vz: 0 }, rng, 3, rel); w.hitK = 1; return w; };
    const toll = (rel, sail, keel = 0) => R.rogueToll(wave(rel), 0, sail, keel);
    const little = toll(0, 1).share, lot = toll(Math.PI / 2, 2).share;
    expect(Math.abs(little - ROGUE.share) < 1e-12 && little <= 0.03, `met bow-on with reefed sails a wave should cost a little: ${(little * 100).toFixed(1)}% of the hull`);
    expect(Math.abs(lot - ROGUE.share * ROGUE.beam * ROGUE.sail[2]) < 1e-12 && lot >= 0.25 && lot < 0.6, `taken side-on under full sail it should cost a lot, but not a whole hull: ${(lot * 100).toFixed(1)}%`);
    expect(toll(Math.PI / 2, 1).share >= little * 3 && toll(0, 2).share >= little * 3, 'side-on, or under full sail, should each cost several times as much as bow-on and reefed');
    for (const sail of [0, 1, 2]) {
      expect(toll(0, sail).share < toll(Math.PI, sail).share && toll(Math.PI, sail).share < toll(Math.PI / 2, sail).share, `sail ${sail}: bow-on should be cheapest, then stern-on, then side-on`);
      expect(toll(0.25, sail).share === toll(0, sail).share && toll(1.2, sail).share === toll(Math.PI / 2, sail).share, `sail ${sail}: within 15° of the bow should count as bow-on, and past 60° as side-on`);
    }
    for (const rel of [0, 0.7, 1.57]) expect(toll(rel, 0).share < toll(rel, 1).share && toll(rel, 1).share < toll(rel, 2).share, 'more sail should cost more');
    const keels = UPGRADES.find((u) => u.key === 'keel').tiers.map((t) => t.value), hulls = UPGRADES.find((u) => u.key === 'hull').tiers.map((t) => t.value);
    const bestKeel = keels[keels.length - 1];
    expect(Math.abs(toll(1.57, 2, bestKeel).share / lot - (1 - bestKeel * ROUGH.keel)) < 1e-12 && ROUGH.keel >= 0.5 && 1 - bestKeel * ROUGH.keel >= 0.4, `the best keel should take off 1 - keel × ROUGH.keel, and leave at least 40% (it leaves ${((1 - bestKeel * ROUGH.keel) * 100).toFixed(0)}%)`);
    expect(toll(0, 1).shove === 0 && Math.abs(toll(1.57, 2).shove - ROGUE.shove) < 1e-9 && toll(1.57, 1).shove < ROGUE.shove, 'only a wave taken on the side should shove the boat, hardest under full sail');
    expect(toll(-1.57, 2).from === 1 && toll(1.57, 2).from === -1, 'a wave from port should say so (from = 1): the camera lurches away from it');
    const glancing = wave(1.57); glancing.hitK = 0.5;
    expect(Math.abs(R.rogueToll(glancing, 0, 2, 0).share - lot / 2) < 1e-12, "a wave's cost should follow how squarely it struck");
    const small = R.launchRogue(still, rng, 1, 1.57); small.hitK = 1;
    expect(Math.abs(R.rogueToll(small, 0, 2, 0).share - lot * ROGUE.size[1]) < 1e-12, "a smaller wave should cost by its size");
    // its own random stream, and the storm's rule left alone
    const run = source[join(SRC, 'rough-water.js')], rules = source[join(SRC, 'rogue.js')], game = source[join(SRC, 'game.js')];
    expect(/this\.rng = mulberry32\(/.test(run) && !/world\.rng|\brng\(\)\s*[,;)]/.test(run.replace(/this\.rng\(\)/g, '')) && !/Math\.random|world/.test(bare(rules)), 'rogue waves must draw from a random stream of their own, never the world\'s or Math.random');
    expect(/T\.share \* b\.maxHealth/.test(run), 'rough-water.js should cost a wave as a share of the hull (T.share * b.maxHealth)');
    expect(game.includes("this.damage(storm * (0.15 + 1.4 * sf * sf) * (1 - up.keel) * dt, 'storm');") && game.includes("this.damage((0.8 + 2.2 * sail) * k * (1 - this.upv.keel), 'storm');"), 'a storm and its bow slams should cost what they did (game.js): resisted by 1 - keel');
    expect(game.includes('rogue: SEAS.waveBeam, rogueSail: SEAS.waveSail') && game.includes('this.rough.warn'), 'game.js should show the wave\'s warning and tell its strikes');
    const debug = source[join(SRC, 'debug.js')];
    expect(debug.includes('  rogue(from?') && debug.includes('  cross({'), 'debug.help() should list rogue() and cross()');

    // ---- the steady wear: by the metre sailed, a share of the hull
    const seaAtWorst = Z.seaAt(...worst);
    expect(Z.roughWear(Z.seaAt(2400, 300), 2, 0) === 0 && Z.roughWear(Z.seaAt(0, 0), 2, 0) === 0, 'plain sea and home waters should not wear the hull');
    expect(Math.abs(Z.roughWear(seaAtWorst, 0, 0) * 1000 - ROUGH.wear[3]) < 1e-12, 'bare poles in the worst of the Reach should cost ROUGH.wear[3] of the hull a kilometre');
    expect(Z.roughWear(seaAtWorst, 0, 0) < Z.roughWear(seaAtWorst, 1, 0) && Z.roughWear(seaAtWorst, 1, 0) < Z.roughWear(seaAtWorst, 2, 0), 'more sail should wear the hull faster');
    expect(Math.abs(Z.roughWear(seaAtWorst, 1, bestKeel) / Z.roughWear(seaAtWorst, 1, 0) - (1 - bestKeel * ROUGH.keel)) < 1e-12, 'the keel should count against the wear as it does against a wave');
    expect(game.includes('roughWear(this.sea, boat.sailLevel, up.keel) * metres * boat.maxHealth') && game.includes('ROUGH.drift * dt'), 'game.js should take the wear by the metre sailed and as a share of the hull, with a stopped boat counted as drifting');
    // one crossing on paper: straight in through the worst, 1 m at a time
    const paper = (zone, sail, keel) => { let lost = 0; for (let d = zone.outer + zone.fade; d > zone.inner - (zone.fadeIn ?? zone.fade); d--) lost += Z.roughWear(Z.seaAt(zone.x + d, zone.z), sail, keel); return lost * 100; };
    const boats = { 'the starting boat': [0, 0], 'hull 3 and keel 2': [3, 2], 'the best boat': [hulls.length - 1, keels.length - 1] };
    const told = [];
    const bands = { 'the starting boat': [[22, 34], [100, 999]], 'hull 3 and keel 2': [[15, 27], [60, 80]], 'the best boat': [[9, 15], [35, 50]] };
    for (const [name, [, keelTier]] of Object.entries(boats)) {
      const keel = keels[keelTier], reefed = paper(reach, 1, keel), full = paper(reach, 2, keel);
      // sailed well: the wear alone (bow-on waves add a few points, and bow slams on a boat with no keel);
      // sailed badly: the wear and one wave taken side-on under full sail
      const badly = full + toll(1.57, 2, keel).share * 100 + (keelTier === 0 ? 6 : 0);
      const [[w0, w1], [b0, b1]] = bands[name];
      if (!(reefed >= w0 && reefed <= w1)) errors.push(`${name}, reefed: the wear of one crossing of the Reach is ${reefed.toFixed(1)}% of the hull, outside ${w0}-${w1}% (the plan's targets, less what waves and slams add)`);
      if (!(badly >= b0 && badly <= b1)) errors.push(`${name}, full sail and one wave side-on: ${badly.toFixed(1)}% of the hull, outside ${b0}-${b1 === 999 ? 'wrecked' : b1 + '%'}`);
      told.push(`${name} ${reefed.toFixed(0)}% reefed, ${Math.min(badly, 100).toFixed(0)}% careless`);
    }
    expect(paper(rip, 1, 0) < paper(reach, 1, 0) * 0.7, 'the Rip should wear the hull less than the Reach');
    for (const hull of hulls) expect(Math.abs((toll(1.57, 2).share * hull) / hull - lot) < 1e-12, 'a wave should take the same share of every hull');

    // ---- the growlers: only in their zone, clear of its calm pocket, and not too many to draw
    const zoneOf = Z.SEA_ZONES.find((r) => r.id === GROWLERS.zone);
    if (!zoneOf || zoneOf.id !== 'reach') errors.push('the growlers should drift in the Frostspire Reach');
    else {
      const all = R.growlersNear(zoneOf.x, zoneOf.z, zoneOf.outer + zoneOf.fade + 200), sea = {}, P = {};
      const pocket = zoneOf.inner - (zoneOf.fadeIn ?? zoneOf.fade);
      expect(all.length > 400, `only ${all.length} growlers in the whole Reach`);
      for (const Gr of all) {
        Z.seaAt(Gr.x, Gr.z, sea);
        const d = Math.hypot(Gr.x - zoneOf.x, Gr.z - zoneOf.z);
        if (sea.roughZone !== 'reach' || sea.rough < GROWLERS.from || d - Gr.drift - Gr.r < pocket) { errors.push(`a growler at ${Gr.x.toFixed(0)}, ${Gr.z.toFixed(0)} is outside the Reach's rough water or in its calm pocket`); break; }
        if (Gr.r < GROWLERS.r[0] || Gr.r > GROWLERS.r[1] || Gr.drift > GROWLERS.drift) { errors.push('a growler is the wrong size, or wanders too far'); break; }
        for (const t of [0, 37, 911]) { R.growlerAt(Gr, t, P); if (Math.hypot(P.x - Gr.x, P.z - Gr.z) > Gr.drift * 1.4143) { errors.push('a growler strays from its place'); break; } }
      }
      expect(JSON.stringify(R.growlersNear(...worst, 300).map((g) => g.id).sort()) === JSON.stringify(R.growlersNear(...worst, 300).map((g) => g.id).sort()), 'the ice should lie in the same places every time');
      const maxIce = Number(run.match(/const MAX_ICE = (\d+);/)?.[1]);
      let most = 0;
      for (let a = 0; a < 24; a++) for (const d of [700, 900, 1100, 1300]) most = Math.max(most, R.growlersNear(zoneOf.x + Math.cos(a * 0.26) * d, zoneOf.z + Math.sin(a * 0.26) * d).length);
      expect(most <= maxIce && most >= 20, `${most} growlers within sight at the thickest: rough-water.js draws up to ${maxIce}, and there should be an ice field to see`);
      // thick enough to matter, thin enough to steer through: about one in the way every 150 m of a careless straight line
      const per = (R.growlersNear(...worst, 250).length / (Math.PI * 250 * 250)) * 1e6;
      expect(per > 60 && per < 220, `${per.toFixed(0)} growlers a square kilometre in the worst of the Reach (expected 60-220)`);
      for (const [x, z, where] of [[0, 0, 'Port Haven'], [rip.x + 900, rip.z, 'the Cinder Rip'], [2400, 300, 'the coast'], [zoneOf.x, zoneOf.z, 'Frostspire itself']]) expect(R.growlersNear(x, z, 400).length === 0, `growlers off ${where}`);
      expect(/chunkGeometry\(\)/.test(run) && /export function chunkGeometry/.test(source[join(SRC, 'sea-wonders.js')]) && /bump\(P\.x, P\.z, G\.r \* 0\.95, 'ice'\)/.test(run) && /clearOfShore/.test(run), "rough-water.js should draw the growlers with the iceberg's loose ice, strike them through the director's bump(), and keep them off the shores");
      told.push(`${all.length} growlers, at most ${most} in sight`);
    }

    // ---- fog gathers in the Reach: out to its edge and in to the island, and nowhere else
    const fog = Z.zoneWeather(...worst)?.fog;
    expect(fog > 1 && Z.zoneWeather(reach.x, reach.z)?.fog === fog && Z.zoneWeather(reach.x + reach.inner - 300, reach.z)?.fog === fog, 'fog should be likelier all through the Reach, its calm pocket and the island included');
    expect(Z.zoneWeather(reach.x + reach.outer + reach.fade, reach.z) === null && Z.zoneWeather(0, 0) === null && Z.zoneWeather(rip.x + 900, rip.z) === null, 'only the Reach should change the weather\'s odds');
    const draws = (more) => { let n = 0; for (let i = 0; i < 7000; i++) if (Z.pickByBand(['breezy', 'cloudy', 'fog', 'clear', 'breezy'], 'open', (i + 0.5) / 7000, more) === 'fog') n++; return n / 7000; };
    expect(Math.abs(draws(null) - 0.2) < 1e-3 && Math.abs(draws({ fog }) - fog / (4 + fog)) < 1e-3, 'after clear weather fog should come one time in five in the open sea, and by its weight in the Reach');
    expect(/pickByBand\(NEXT\[this\.type\], band, Math\.random\(\), more\)/.test(source[join(SRC, 'weather.js')]) && /zoneWeather\(boat\.pos\.x, boat\.pos\.z\)/.test(game), 'weather.js should weight the next weather by the zone the boat is in');
    return { errors, note: `the ridge on the shader and the CPU agree at ${compared} points; a wave costs ${(little * 100).toFixed(1)}% of the hull bow-on and reefed, ${(lot * 100).toFixed(0)}% side-on under full sail; one crossing of the Reach on paper: ${told.join('; ')}; fog × ${fog} in the Reach` };
  },

  // How a boat rides the wave set (WAVE_DEFS in config.js): pitch and bow slams
  // by the same sums as boat/rig.js (animate) and game.js (checkBowSlam), at
  // 9 m/s on eight headings, in clear weather and in a storm (their `wave` and
  // `swell` from weather.js). A retuned sea should stay inside these limits, so
  // that sailing feels about the same and storms cost about as much hull.
  // Each is sailed twice: out in plain sea, far from any zone (sea-zones.js),
  // and across home waters from one side to the other, where the sea is calmer.
  // Then through the worst of each rough zone under a clear sky, where the
  // swell's floor should make a sea of its own, and the roughest in a storm.
  // No rogue wave is out in any of those, so they stay as they were; one is then
  // met in the Reach, bow-on and on the beam.
  async ride() {
    const errors = [];
    const { updateWaves, waveHeight, setSeaOrigin, setRogueWave, rogueHeight, waveUniforms } = await load('waves.js');
    const { SEA_ZONES, seaAt, swellAt } = await load('sea-zones.js');
    setRogueWave(); // none, for everything up to the rogue wave's own case
    const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
    let origin = [1e5, 0], plain = true; // where on the map a run's (0, 0) is, and whether that is plain sea
    const sea = {};
    const place = (x, z, isPlain = false) => { origin = [x, z]; plain = isPlain; setSeaOrigin(x, z); };
    const sail = (wave, swell, heading, seconds, start = 0) => {
      const dt = 1 / 60, fx = Math.sin(heading), fz = Math.cos(heading);
      let x = -fx * start, z = -fz * start, t = 0, pitch = 0, last = 0, wait = 0, slams = 0, sum = 0, n = 0, crest = -Infinity;
      for (let i = 0; i < seconds * 60; i++) {
        t += dt;
        updateWaves(t * 0.6, wave, swell); // game.js runs the sea at 0.6 of real time
        x += fx * 9 * dt; z += fz * 9 * dt;
        const bow = waveHeight(x + fx * 3, z + fz * 3), stern = waveHeight(x - fx * 3, z - fz * 3);
        pitch = damp(pitch, -Math.atan2(bow - stern, 6) * 0.8, 5, dt);
        const rate = (pitch - last) / dt;
        last = pitch; wait -= dt;
        // (game.js only counts a slam where the swell is heavy enough: the weather's, times the zone's)
        if (wait <= 0 && pitch > 0.08 && rate > 0.11 && (plain || swellAt(seaAt(x + origin[0], z + origin[1], sea), swell) >= 0.4)) { wait = 3.5; slams++; }
        if (i > 120) { sum += pitch * pitch; n++; crest = Math.max(crest, (bow + stern) / 2); }
      }
      return { pitch: (Math.sqrt(sum / n) * 180) / Math.PI, slams: slams / (seconds / 60), crest };
    };
    // `start`: 0 = from the origin (of plain sea), or this far short of it, so the run crosses a zone's middle
    const over = (wave, swell, seconds = 240, start = 0) => {
      const runs = Array.from({ length: 8 }, (_, h) => sail(wave, swell, (h / 8) * Math.PI * 2, seconds, start));
      const mean = (k) => runs.reduce((a, r) => a + r[k], 0) / runs.length;
      return { pitch: mean('pitch'), slams: mean('slams'), crest: Math.max(...runs.map((r) => r.crest)) };
    };
    place(1e5, 0, true); // plain sea: today's numbers
    const clear = over(0.35, 0), storm = over(1.7, 1);
    place(0, 0);          // home waters: 220 s at 9 m/s is its full width, edge to edge
    const reach = SEA_ZONES[0].outer - 10;
    const homeClear = over(0.35, 0, (reach * 2) / 9, reach), homeStorm = over(1.7, 1, (reach * 2) / 9, reach);
    // rough water: 40 s through the worst of each zone on the same eight headings, under a clear sky, and the Reach in a storm
    const rough = {};
    for (const R of SEA_ZONES.filter((r) => r.severity)) {
      place(...(R.edge ? [300, R.inner + 150] : [R.x + (R.inner + R.outer) / 2, R.z]));
      rough[R.id] = over(0.35, 0, 40, 180);
      if (R.severity === 3) rough.storm = over(1.7, 1, 40, 180);
    }
    // a rogue wave (rogue.js) in the worst of the Reach under a clear sky, at 9 m/s: met
    // bow-on the boat climbs it and pitches hard; taken on the beam it rolls her instead.
    // The same 12 s are sailed without one, to see what the wave alone adds.
    const { ROGUE } = await load('config.js');
    const { launchRogue, stepRogue } = await load('rogue.js');
    const reachZ = SEA_ZONES.find((r) => r.severity === 3);
    const meet = (rel) => {
      place(reachZ.x + (reachZ.inner + reachZ.outer) / 2, reachZ.z);
      const dt = 1 / 60, boat = { x: 0, z: 0, heading: 0, vx: 0, vz: 9 };
      const out = { pitch: 0, roll: 0, lift: 0, calmPitch: 0, calmRoll: 0 };
      for (const withWave of [false, true]) {
        const Wv = withWave ? launchRogue({ ...boat, x: origin[0], z: origin[1] }, () => 0.5, 3, rel) : null;
        let z = 0, pitch = 0, roll = 0;
        for (let i = 0; i < 12 * 60; i++) {
          updateWaves(i * dt * 0.6, 0.35, 0);
          z += 9 * dt;
          if (Wv) { stepRogue(Wv, dt, { x: origin[0], z: origin[1] + z, vx: 0, vz: 9 }); setRogueWave(Wv.x, Wv.z, Wv.dx, Wv.dz, Wv.h); }
          // the same sums as boat/rig.js (animate): starboard is -x when the bow points along +z
          const bow = waveHeight(0, z + 3), stern = waveHeight(0, z - 3), port = waveHeight(1.4, z), star = waveHeight(-1.4, z);
          pitch = damp(pitch, -Math.atan2(bow - stern, 6) * 0.8, 5, dt);
          roll = damp(roll, Math.atan2(port - star, 2.8) * 0.7, 5, dt);
          const key = withWave ? ['pitch', 'roll'] : ['calmPitch', 'calmRoll'];
          out[key[0]] = Math.max(out[key[0]], Math.abs(pitch)); out[key[1]] = Math.max(out[key[1]], Math.abs(roll));
          if (Wv) out.lift = Math.max(out.lift, rogueHeight(origin[0], origin[1] + z));
        }
        setRogueWave();
      }
      for (const k of ['pitch', 'roll', 'calmPitch', 'calmRoll']) out[k] = (out[k] * 180) / Math.PI;
      return out;
    };
    const bowOn = meet(0), beamOn = meet(Math.PI / 2);
    setSeaOrigin(0, 0);
    const want = (label, v, lo, hi, unit) => { if (!(v >= lo && v <= hi)) errors.push(`${label} is ${v.toFixed(2)}${unit}, outside ${lo}-${hi}${unit}`); };
    if (waveUniforms.uRogueH.value !== 0) errors.push('a rogue wave was left standing after the ride');
    want('a rogue wave met bow-on: the steepest pitch', bowOn.pitch, 14, 30, '°');
    want('a rogue wave met bow-on: how high it lifts the boat', bowOn.lift, ROGUE.height * 0.9, ROGUE.height * 1.001, ' m');
    want('a rogue wave taken on the beam: the steepest roll', beamOn.roll, 10, 32, '°');
    if (!(bowOn.pitch > bowOn.calmPitch * 1.4 && beamOn.roll > beamOn.calmRoll * 1.6)) errors.push(`a rogue wave should throw the boat about more than the Reach's own sea does (pitch ${bowOn.pitch.toFixed(1)}° against ${bowOn.calmPitch.toFixed(1)}°, roll ${beamOn.roll.toFixed(1)}° against ${beamOn.calmRoll.toFixed(1)}°)`);
    if (!(beamOn.roll > bowOn.roll * 1.5 && bowOn.pitch > beamOn.pitch)) errors.push('met bow-on a rogue wave should pitch the boat, taken on the beam it should roll her');
    want('clear weather: the pitch (rms)', clear.pitch, 0.8, 2, '°');
    want('clear weather: the tallest crest', clear.crest, 0.5, 1.5, ' m');
    want('a storm: the pitch (rms)', storm.pitch, 5, 9, '°');
    want('a storm: bow slams a minute', storm.slams, 5, 11, '');
    want('a storm: the tallest crest', storm.crest, 6, 12, ' m');
    want('home waters, clear weather: the pitch (rms)', homeClear.pitch, 0.4, 1, '°');
    want('home waters, clear weather: the tallest crest', homeClear.crest, 0.25, 0.75, ' m');
    want('home waters, a storm: the pitch (rms)', homeStorm.pitch, 2.5, 4.5, '°');
    want('home waters, a storm: bow slams a minute', homeStorm.slams, 0, 5, '');
    want('home waters, a storm: the tallest crest', homeStorm.crest, 3, 6, ' m');
    if (!(homeStorm.pitch < storm.pitch * 0.6 && homeStorm.slams < storm.slams * 0.6)) errors.push('a storm should be much easier to ride in home waters than outside');
    // rough water under a clear sky: a real sea in each zone, worse with severity, and slams from the Rip up
    const limits = { reach: [3, 5.5, 1.5, 5, 4.5, 8], rip: [2.4, 4.5, 1, 4.5, 3, 6], swell: [1.5, 3, 0, 2, 2, 4] };
    for (const [id, [p0, p1, s0, s1, c0, c1]] of Object.entries(limits)) {
      const r = rough[id];
      if (!r) { errors.push(`no rough zone "${id}" to ride (update this check)`); continue; }
      want(`${id}, clear weather: the pitch (rms)`, r.pitch, p0, p1, '°');
      want(`${id}, clear weather: bow slams a minute`, r.slams, s0, s1, '');
      want(`${id}, clear weather: the tallest crest`, r.crest, c0, c1, ' m');
    }
    if (rough.reach && rough.rip && rough.swell && !(rough.reach.pitch > rough.rip.pitch && rough.rip.pitch > rough.swell.pitch && rough.swell.pitch > clear.pitch * 1.5)) errors.push('rough water should ride harder with each severity, and all of it harder than plain sea');
    if (rough.storm && !(rough.storm.pitch > storm.pitch && rough.storm.slams > storm.slams)) errors.push('a storm in the roughest zone should be the worst water there is');
    const told = (r) => `pitch ${r.pitch.toFixed(1)}°, ${r.slams.toFixed(1)} bow slams a minute, crests to ${r.crest.toFixed(1)} m`;
    const roughTold = Object.entries(rough).map(([id, r]) => `${id === 'storm' ? 'the roughest in a storm' : id}: ${told(r)}`).join('; ');
    return { errors, note: `clear: pitch ${clear.pitch.toFixed(1)}°, crests to ${clear.crest.toFixed(1)} m; storm: ${told(storm)}; home waters, clear: pitch ${homeClear.pitch.toFixed(1)}°, crests to ${homeClear.crest.toFixed(1)} m; home waters, storm: ${told(homeStorm)}; rough water, clear: ${roughTold}; a rogue wave in the Reach: bow-on it lifts the boat ${bowOn.lift.toFixed(1)} m and pitches her ${bowOn.pitch.toFixed(0)}° (${bowOn.calmPitch.toFixed(0)}° without it), on the beam it rolls her ${beamOn.roll.toFixed(0)}° (${beamOn.calmRoll.toFixed(0)}°)` };
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
    const { layoutLevel, routeStats, LIMITS } = await load('ashore/modules.js');
    const { mulberry32 } = await load('util.js');
    const { ASHORE_BIOMES, ASHORE } = await load('config.js');
    const { jumpArc } = await load('ashore/controller.js');
    // the levels' limits stay inside what a jump really does: the required
    // moves, and the optional ones (fixed numbers, so islands don't change)
    const arc = jumpArc(ASHORE), D = ASHORE.design;
    const reach = (top) => top * arc.air;
    if (D.jumpUp > arc.up * 0.8) errors.push(`a jump goes ${arc.up.toFixed(2)} m up: too close to design.jumpUp ${D.jumpUp}`);
    if (D.gapRun > reach(ASHORE.run) * 0.8) errors.push(`a run-jump covers ${reach(ASHORE.run).toFixed(2)} m: too close to design.gapRun ${D.gapRun}`);
    if (LIMITS.optional.up > arc.up * 0.92) errors.push(`optional climbs up to ${LIMITS.optional.up.toFixed(2)} m, but a jump goes ${arc.up.toFixed(2)} m`);
    if (LIMITS.optional.gap > reach(ASHORE.walk) * 0.92) errors.push(`optional gaps up to ${LIMITS.optional.gap.toFixed(2)} m, but a walking jump covers ${reach(ASHORE.walk).toFixed(2)} m`);
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
    return { errors, note: `a held jump ${arc.up.toFixed(2)} m up, ${arc.air.toFixed(2)} s in the air; ${count} islands per biome to the summit, on average ${notes.join('; ')}; ${climber.stats.retries} hops needed a second try` };
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
    // a missed hop gets a second try at the other pace, as on Archway Isle
    const climb = (nodes, label) => climber(L, nodes, label, errors, 2);
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
    return { errors, note: `${s.pieces} pieces, ${s.coins} coins; to the owl bough in ${main.toFixed(0)} s (${s.jumps} jumps), the crown in ${crown.toFixed(0)} s more (${s.crownJumps} jumps); ${climber.stats.retries} hops needed a second try` };
  },

  // Archway Isle: the layout keeps its design limits, and a test climber gets
  // from the cove over the arch, and on up the seaward stack.
  async archway() {
    const { buildArchwayLayout, validateArchway } = await load('ashore/archway-layout.js');
    const L = buildArchwayLayout();
    const v = validateArchway(L);
    const errors = [...v.errors];
    // the story: the chest's piece exists, and the journal kept here has its step text
    const { STYLES } = await load('cosmetics.js');
    const { STEPS } = await load('story-text.js');
    for (const c of L.chests) if (c.cosmetic && !STYLES.some((s) => s.id === c.cosmetic)) errors.push(`chest: no cosmetic "${c.cosmetic}"`);
    const step = STEPS.ashore[L.spots.journal?.id];
    if (!step?.text || !step.noAnchor || !step.where) errors.push(`story: STEPS.ashore.${L.spots.journal?.id} needs text, noAnchor and where`);
    const climber = await testClimber();
    const main = climber(L, L.route, 'main', errors, 2);
    const stack = climber(L, L.stack, 'stack', errors, 2);
    const s = v.stats;
    return { errors, note: `${s.pieces} pieces, ${s.coins} coins; cove to the east arm in ${main.toFixed(0)} s (${s.jumps} jumps), the stack in ${stack.toFixed(0)} s more (${s.stackJumps} jumps); ${climber.stats.retries} hops needed a second try` };
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
