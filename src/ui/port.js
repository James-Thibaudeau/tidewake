// UI part: the port screen (shipwright, quest board, tailor, harbor talk) and
// the journal. Methods are mixed into UI (see ../ui.js), so `this` is the UI
// instance.
import { UPGRADES } from '../config.js';
import { STYLES, owns } from '../cosmetics.js';
import { MAX_ACTIVE, fmtDist } from '../quests.js';
import { JOURNALS, LETTERS, LINES } from '../story-text.js';
import { LINES as RIVAL_LINES } from '../rival-text.js';
import { $, ROMAN, esc, fmt } from './shared.js';
import { ICONS } from './icons.js';

// First-visit tips for the port tabs, shown as a note in the tab (flags saved in story.flags)
const PORT_TAB_HINTS = {
  quests: {
    flag: 'hintQuestBoard',
    text: `Quest board: take up to ${MAX_ACTIVE} jobs at a time. Finish a job, then dock to collect the reward. Press J to see your quests and pin one.`,
    touch: `Quest board: take up to ${MAX_ACTIVE} jobs at a time. Finish a job, then dock to collect the reward. Tap the scroll button to see your quests and pin one.`,
  },
  tailor: {
    flag: 'hintTailor',
    text: 'New to the Tailor? Pieces sold here cost banked gold. Others are quest rewards, and the rarest are hidden in island chests.',
  },
};
PORT_TAB_HINTS.tailor.touch = PORT_TAB_HINTS.tailor.text;

export class PortUI {
  // ------------------------------------------------------------ port
  openPort(island, tab = 'shipwright') {
    this.portIsland = island || this.game.dockedIsland || null;
    this.setPortTab(tab);
    if (this.el.portName) this.el.portName.textContent = this.portIsland ? this.portIsland.name : 'Harbor';
    this.el.portScreen?.classList.remove('hidden');
    this.refreshPort();
    const sheet = this.el.portScreen?.querySelector('.sheet');
    if (sheet) sheet.scrollTop = 0;
  }
  closePort() { this.el.portScreen?.classList.add('hidden'); }

  setPortTab(tab) {
    this.portTab = tab;
    this.el.portTabs?.querySelectorAll('button[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    this.el.paneShipwright?.classList.toggle('hidden', tab !== 'shipwright');
    this.el.paneQuests?.classList.toggle('hidden', tab !== 'quests');
    this.el.paneTailor?.classList.toggle('hidden', tab !== 'tailor');
    this.portTabHint(tab);
  }

  /** A one-time tip the first time the quest board or the Tailor is opened. */
  portTabHint(tab) {
    const hint = PORT_TAB_HINTS[tab], g = this.game, flags = g.state?.story?.flags;
    if (!hint || !flags || flags[hint.flag]) return;
    flags[hint.flag] = true;
    if (g.mode === 'docked') g.savePortState();
    // a note at the top of the tab: toasts sit under the port sheet
    const pane = tab === 'quests' ? this.el.paneQuests : this.el.paneTailor;
    if (!pane) return;
    const note = document.createElement('div');
    note.className = 'tabHint';
    note.innerHTML = `<p>${esc(this.touch ? hint.touch : hint.text)}</p><button class="btn">Got it</button>`;
    note.querySelector('button').addEventListener('click', () => { this.click(); note.remove(); });
    pane.prepend(note);
  }

  // ------------------------------------------------------------ quests
  avatar(giver) {
    const hue = [...giver.name].reduce((h, c) => h + c.charCodeAt(0) * 37, 0) % 360;
    return `<span class="avatar" style="background:hsl(${hue} 70% 72%)">${esc(giver.name[0])}</span>`;
  }

  questCard(q, mode) {
    const g = this.game, Qs = g.quests;
    const cos = q.reward.cosmetic ? STYLES.find((s) => s.id === q.reward.cosmetic) : null;
    const meta = [`<span class="gold">${ICONS.coin.replace('<svg', '<svg class="ico" style="width:13px;height:13px;vertical-align:-2px"')} ${fmt(q.reward.gold)}</span>`];
    if (q.type === 'deliver' && q.days) meta.push(`<span>+${fmt(q.bonus)} within ${q.days} day${q.days === 1 ? '' : 's'}</span>`);
    if (cos) meta.push(`<span class="cos">+ ${esc(cos.name)}</span>`);
    if (q.fragment) meta.push('<span class="cos">+ charts a new island</span>');
    if (q.dist) meta.push(`<span>${fmtDist(q.dist)}</span>`);
    let foot = '';
    if (q.type === 'story') {
      const pinned = Qs.pinned?.id === q.id;
      return `<div class="card qCard storyQ${pinned ? ' pinned' : ''}">
        <div class="giver">${this.avatar(q.giver)}<span><b>${esc(q.giver.role)}</b> · ${esc(q.giver.label || "Grandfather's Journals")}</span></div>
        <div class="qTitle">${esc(q.title)}</div>
        <div class="qText">${esc(q.text)}</div>
        <div class="qStatus">${esc(Qs.status(q))}</div>
        <div class="row2"><button class="btn" data-pin="${q.id}" ${pinned ? 'disabled' : ''}>${pinned ? 'Tracking' : 'Track'}</button></div></div>`;
    }
    if (mode === 'offer') {
      const can = Qs.canAccept();
      foot = `<button class="btn${can ? ' primary' : ''}" data-accept="${q.id}" ${can ? '' : 'disabled'}>${can ? 'Accept' : `${MAX_ACTIVE} quests already`}</button>`;
    } else {
      const pinned = Qs.pinned?.id === q.id;
      foot = `<div class="qStatus">${esc(Qs.status(q))}</div>
        <div class="row2"><button class="btn" data-pin="${q.id}" ${pinned ? 'disabled' : ''}>${pinned ? 'Tracking' : 'Track'}</button>
        <button class="btn danger" data-abandon="${q.id}">Abandon</button></div>`;
    }
    const from = g.world.islands[q.from];
    return `<div class="card qCard${mode !== 'offer' && Qs.pinned?.id === q.id ? ' pinned' : ''}">
      <div class="giver">${this.avatar(q.giver)}<span><b>${esc(q.giver.name)}</b> · ${esc(q.giver.role)}${mode !== 'offer' && from ? `, ${esc(from.name)}` : ''}</span></div>
      <div class="qTitle">${esc(q.title)}</div>
      <div class="qText">${esc(q.text)}</div>
      <div class="qMeta">${meta.join('')}</div>
      ${foot}</div>`;
  }

  refreshQuests() {
    const g = this.game, Qs = g.quests, port = this.portIsland;
    if (!Qs || !port || !this.el.questOffers) return;
    const offers = Qs.board(port);
    const n = Qs.active.length;
    this.el.questCount.innerHTML = `Active quests: <b>${n}/${MAX_ACTIVE}</b>${n ? ' · open the journal (<kbd>J</kbd>) to track or abandon them' : ''}. Rewards are paid when you dock.`;
    this.el.questOffers.innerHTML = offers.length
      ? offers.map((o) => this.questCard(o, 'offer')).join('')
      : '<div class="qEmpty">No work posted today. Check back tomorrow.</div>';
    const badge = this.el.questBadge;
    if (badge) { badge.textContent = offers.length; badge.classList.toggle('hidden', !offers.length || !Qs.canAccept()); }
  }

  // ------------------------------------------------------------ journal
  get isJournalOpen() { return !!this.journalOpen; }
  /** tab: 'quests' | 'story'; page: a journal id ('I'..'VII') or 'letters'. */
  openJournal(tab, page) {
    if (!this.game.quests) return;
    if (tab) this.journalTab = tab;
    if (page) this.journalPage = page;
    this.journalOpen = true;
    this.renderJournal();
    this.el.journalScreen?.classList.remove('hidden');
    const sheet = this.el.journalScreen?.querySelector('.sheet');
    if (sheet) sheet.scrollTop = 0;
  }
  closeJournal() { this.journalOpen = false; this.el.journalScreen?.classList.add('hidden'); }
  toggleJournal() { if (this.journalOpen) this.closeJournal(); else this.openJournal(); }

  renderJournal() {
    const sable = this.game.rival?.journal();
    let tab = this.journalTab || 'quests';
    if (tab === 'sable' && !sable) tab = this.journalTab = 'quests';
    this.el.journalTabs?.querySelectorAll('button[data-jtab]').forEach((b) => {
      b.classList.toggle('on', b.dataset.jtab === tab);
      if (b.dataset.jtab === 'sable') b.classList.toggle('hidden', !sable);
    });
    this.el.journalTitle.textContent = { story: "Grandfather's Journals", sable: 'Captain Sable' }[tab] || 'Quests';
    if (tab === 'story') { this.el.journalBody.innerHTML = this.renderStoryPages(); return; }
    if (tab === 'sable') { this.el.journalBody.innerHTML = this.renderSable(sable); return; }
    const Qs = this.game.quests;
    let html = '';
    const sq = Qs.storyQuests;
    if (sq.length) html += `<h3 class="sectionTitle">Main story</h3><div class="grid">${sq.map((q) => this.questCard(q, 'active')).join('')}</div>`;
    html += `<h3 class="sectionTitle">Active (${Qs.active.length}/${MAX_ACTIVE})</h3>`;
    html += Qs.active.length
      ? `<div class="grid">${Qs.active.map((q) => this.questCard(q, 'active')).join('')}</div>`
      : '<div class="qEmpty">No quests yet. Quest boards are posted in every port.</div>';
    const done = (this.game.state.stats?.quests || 0);
    html += `<h3 class="sectionTitle">Completed</h3><div class="qEmpty">${done ? `${done} quest${done === 1 ? '' : 's'} completed.` : 'None yet.'}</div>`;
    this.el.journalBody.innerHTML = html;
  }

  renderStoryPages() {
    const story = this.game.story, S = story?.S;
    if (!S) return '';
    const found = new Set(S.journals);
    const pages = [...ROMAN.map((id) => ({ id, j: JOURNALS.find((x) => x.id === id) })), { id: 'letters', j: LETTERS }];
    const have = (id) => (id === 'letters' ? !!S.flags.letters : found.has(id));
    let cur = this.journalPage;
    if (!cur || !have(cur)) cur = [...pages].reverse().find((p) => have(p.id))?.id || null;
    this.journalPage = cur;
    const list = pages.map((p) => {
      const ok = have(p.id);
      const label = p.id === 'letters' ? (ok ? esc(p.j.title) : 'A sealed chest…') : `<span class="num">${p.id}</span>${ok ? esc(p.j.title) : 'Not yet found'}`;
      return `<button data-page="${p.id}" class="${ok ? '' : 'missing'}${p.id === cur ? ' on' : ''}">${label}</button>`;
    }).join('');
    let page;
    if (!cur) page = '<div class="jPage torn">His first journal is still aboard the wreck, just past the point.</div>';
    else {
      const p = pages.find((x) => x.id === cur).j;
      const paras = p.body.split('\n\n');
      const sign = cur === 'letters' ? '' : paras.pop();
      page = `<div class="jPage"><div class="jNo">${cur === 'letters' ? 'From the chest under the bunk' : `Journal ${cur}`}</div><h3>${esc(p.title)}</h3>
        ${paras.map((x) => `<p>${esc(x)}</p>`).join('')}${sign ? `<p class="sign">${esc(sign)}</p>` : ''}
        ${p.clue ? `<p class="clue">${esc(p.clue)}</p>` : ''}</div>`;
    }
    return `<div class="jStory"><div class="jList">${list}</div>${page}</div>`;
  }

  /** The Captain Sable tab: the record, what you've learned, and everything they've said to you (newest first). */
  renderSable(s) {
    let html = `<div class="card qCard rivalLog"><div class="giver"><span class="avatar" style="background:#e8413a">S</span><span><b>Captain Sable</b> · ${s.friend ? 'a friend' : 'a rival'}</span></div>
      <div class="qTitle">${esc(s.record)}</div>
      ${s.title ? `<div class="qStatus">Your title: ${esc(s.title)}</div>` : ''}
      ${s.step ? `<div class="qText"><b>${esc(s.step.title)}:</b> ${esc(s.step.text)}</div>` : ''}</div>`;
    html += `<h3 class="sectionTitle">What you know</h3><div class="card qCard rivalLog">${s.learned.length
      ? `<ul>${s.learned.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
      : '<div class="qText">Nothing yet, except that they are fast.</div>'}</div>`;
    html += '<h3 class="sectionTitle">Conversations</h3>';
    html += s.log.length
      ? s.log.map((e) => `<div class="card sableTalk${e.scene ? ' scene' : ''}"><div class="talkHead"><b>${esc(e.title)}</b>${e.day ? `<span>Day ${e.day}</span>` : ''}</div>
        ${e.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`).join('')
      : '<div class="qEmpty">Nothing said yet.</div>';
    return html;
  }

  /** Harbor talk about the Redwing, or Sable in person, above the quest offers. */
  refreshRivalNotes() {
    const box = this.el.rivalNotes, rv = this.game.rival, port = this.portIsland;
    if (!box) return;
    const n = rv && port ? rv.portNotes(port) : null;
    let html = '';
    if (n?.rumour) {
      html += `<div class="card qCard rivalNote"><div class="giver"><span class="avatar" style="background:#e8413a">!</span><span><b>${esc(n.rumour.eyebrow)}</b></span></div>
        <div class="qTitle">${esc(n.rumour.title)}</div><div class="qText">${esc(n.rumour.text)}</div></div>`;
    }
    if (n?.friend) {
      const f = n.friend;
      html += `<div class="card qCard rivalNote"><div class="giver"><span class="avatar" style="background:#e8413a">S</span><span><b>Captain Sable</b> · a friend</span></div>
        <div class="qTitle">${esc(f.title)}</div><div class="qText">${esc(f.text)}</div>
        <div class="qMeta"><span class="gold">${f.gold ? `${fmt(f.gold)} gold for a win` : 'Just for fun until tomorrow'}</span></div>
        <div class="row2">${f.races.map((r) => `<button class="btn" data-rematch="${r.id}">${esc(r.title)}</button>`).join('')}</div></div>`;
    }
    box.innerHTML = html;
    const dye = this.el.sailDye;
    if (dye) {
      dye.classList.toggle('hidden', !rv?.canDye);
      this.el.btnSailDye.textContent = rv?.dyeOn ? RIVAL_LINES.dye.on : RIVAL_LINES.dye.off;
      this.el.btnSailDye.classList.toggle('off', !rv?.dyeOn);
    }
  }

  refreshTailor() {
    const st = this.game.state, grid = this.el.tailorGrid;
    if (!grid) return;
    const SLOT = { hat: 'Hat', top: 'Top', bottom: 'Bottoms', boots: 'Boots', neck: 'Neck', extra: 'Bag' };
    grid.innerHTML = STYLES.filter((s) => s.source === 'tailor').map((s) => {
      const have = owns(st.wardrobe, s.slot, s.style);
      const afford = st.banked >= s.price;
      const btn = have ? '<button class="btn" disabled>Owned</button>'
        : `<button class="btn${afford ? ' primary' : ''}" data-buy="${s.id}" ${afford ? '' : 'disabled'}>Buy <span class="ico">${ICONS.coin}</span> ${fmt(s.price)}</button>`;
      return `<div class="card${have ? ' owned' : ''}">
        <div class="cardHead"><div class="cardIcon">${ICONS.needle}</div>
          <div><div class="cardName">${esc(s.name)}</div><div class="cardStat">${SLOT[s.slot] || s.slot}</div></div></div>
        <div class="cardCur">${have ? 'In your wardrobe' : 'Sold at every port tailor'}</div>
        ${btn}</div>`;
    }).join('');
  }

  refreshPort() {
    const g = this.game, st = g.state, b = g.boat;
    if (!st || !this.el.upgradeGrid) return;
    this.el.portGold.textContent = fmt(st.banked);
    this.refreshTailor();
    this.refreshQuests();
    this.refreshRivalNotes();
    const maxH = (b && b.maxHealth) || 100;
    this.el.portHull.textContent = `Hull ${Math.ceil(st.health || 0)}/${maxH}`;
    const cost = g.repairCost ? g.repairCost() : 0;
    const full = (st.health || 0) >= maxH - 0.5;
    const rb = this.el.btnRepair;
    rb.disabled = full || (cost > 0 && st.banked <= 0);
    rb.innerHTML = full ? `${ICONS.check.replace('<svg', '<svg class="ico"')} Hull sound`
      : `Repair <span class="ico">${ICONS.coin}</span> ${fmt(cost)}${cost > st.banked ? ' (partial)' : ''}`;

    this.el.upgradeGrid.innerHTML = UPGRADES.map((u) => {
      const lvl = Math.min(st.upgrades?.[u.key] || 0, u.tiers.length - 1);
      const cur = u.tiers[lvl], next = u.tiers[lvl + 1];
      const pips = u.tiers.map((_, i) => `<span class="pip${i <= lvl ? ' on' : ''}"></span>`).join('');
      const afford = next && st.banked >= next.cost;
      const found = u.key === 'spyglass' && lvl === 0; // the first spyglass is grandfather's, not for sale
      const btn = found ? `<button class="btn" disabled>${esc(LINES.shipwrightSpyglass)}</button>`
        : next
          ? `<button class="btn${afford ? ' primary' : ''}" data-key="${u.key}" ${afford ? '' : 'disabled'}>Buy <span class="ico">${ICONS.coin}</span> ${fmt(next.cost)}</button>`
          : '<button class="btn" disabled>Fully upgraded</button>';
      return `<div class="card${next ? '' : ' maxed'}">
        <div class="cardHead"><div class="cardIcon">${ICONS[u.icon] || ''}</div>
          <div><div class="cardName">${esc(u.name)}</div><div class="cardStat">${esc(u.stat)}</div></div>
          <div class="pips">${pips}</div></div>
        <div class="cardCur">${esc(cur.label)}</div>
        <div class="cardNext">${next ? `Next: <b>${esc(next.label)}</b>` : 'The finest on the seas.'}</div>
        ${btn}</div>`;
    }).join('') + this.anchorCard();
  }

  /** Grandfather's anchor at the shipwright: its refit tier, and the refit button when the fitting is aboard. */
  anchorCard() {
    const c = this.game.refits?.card();
    if (!c) return '';
    const pips = Array.from({ length: c.tiers }, (_, i) => `<span class="pip${i <= c.tier ? ' on' : ''}"></span>`).join('');
    const b = c.button;
    const btn = !b ? '' : b.cost != null
      ? `<button class="btn${b.enabled ? ' primary' : ''}" data-refit="1" ${b.enabled ? '' : 'disabled'}>${esc(b.label)} <span class="ico">${ICONS.coin}</span> ${fmt(b.cost)}</button>`
      : `<button class="btn" disabled>${esc(b.label)}</button>`;
    return `<div class="card${c.next ? '' : ' maxed'}">
      <div class="cardHead"><div class="cardIcon">${ICONS.anchor}</div>
        <div><div class="cardName">Anchor</div><div class="cardStat">Where you can land</div></div>
        <div class="pips">${pips}</div></div>
      <div class="cardCur">${esc(c.cur)}</div>
      <div class="cardNext">${c.next ? `Next: <b>${esc(c.next)}</b>` : esc(c.note || '')}</div>
      ${btn}</div>`;
  }
}
