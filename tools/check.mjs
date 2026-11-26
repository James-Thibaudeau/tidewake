#!/usr/bin/env node
// Fast checks that need no browser and no dependencies:
//
//   node tools/check.mjs            everything (about a second)
//   node tools/check.mjs imports    one group: syntax | imports | names | text | dom | gallery | save | sea | seazones | ride | layout | climb | grove | archway
//   node tools/check.mjs layout 500 layouts for 500 synthetic islands (default 150)
//
// Run it after every change. It catches the mistakes that otherwise only show
// up as a blank page: a syntax error, an import of a name the other module
// doesn't export, a helper left behind when code moved to another file, a
// text key or element id that doesn't exist, a save that no longer migrates,
// a sea event that could turn up in the wrong place, sea zones that leave home
// out, put rough water over a port or a landing, or disagree between the CPU
// and the shaders, a wave set the boat rides too hard or too gently, and an
// ashore layout that fails its own validation.
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
    const objects = { quests: ['active', 'done', 'boards', 'pinned', 'reports'], story: ['chapter', 'journals', 'flags', 'seenCards'], rival: ['chapter', 'wins', 'losses', 'flags', 'log'], ashore: [], sightings: ['seen', 'miss', 'chain'] };
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
    return { errors, note: `${Object.keys(cases).length} saves` };
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
      if (!(ROUGH.floor[R.severity] > 0 && ROUGH.batter[R.severity] > 0)) errors.push(`${name}: severity ${R.severity} has no swell floor or battering in ROUGH (config.js)`);
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

  // How a boat rides the wave set (WAVE_DEFS in config.js): pitch and bow slams
  // by the same sums as boat/rig.js (animate) and game.js (checkBowSlam), at
  // 9 m/s on eight headings, in clear weather and in a storm (their `wave` and
  // `swell` from weather.js). A retuned sea should stay inside these limits, so
  // that sailing feels about the same and storms cost about as much hull.
  // Each is sailed twice: out in plain sea, far from any zone (sea-zones.js),
  // and across home waters from one side to the other, where the sea is calmer.
  // Then through the worst of each rough zone under a clear sky, where the
  // swell's floor should make a sea of its own, and the roughest in a storm.
  async ride() {
    const errors = [];
    const { updateWaves, waveHeight, setSeaOrigin } = await load('waves.js');
    const { SEA_ZONES, seaAt, swellAt } = await load('sea-zones.js');
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
    setSeaOrigin(0, 0);
    const want = (label, v, lo, hi, unit) => { if (!(v >= lo && v <= hi)) errors.push(`${label} is ${v.toFixed(2)}${unit}, outside ${lo}-${hi}${unit}`); };
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
    return { errors, note: `clear: pitch ${clear.pitch.toFixed(1)}°, crests to ${clear.crest.toFixed(1)} m; storm: ${told(storm)}; home waters, clear: pitch ${homeClear.pitch.toFixed(1)}°, crests to ${homeClear.crest.toFixed(1)} m; home waters, storm: ${told(homeStorm)}; rough water, clear: ${roughTold}` };
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
