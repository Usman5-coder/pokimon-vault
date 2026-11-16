// Admin demo interactions. Visual demo only: nothing is saved or sent anywhere.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const views = $$('.view'), links = $$('.sb a.n[data-view]');
const names = { overview: 'Overview', boxes: 'Boxes', prizes: 'Prizes', streams: 'Streams', battles: 'Battles', flagged: 'Flagged accounts', audit: 'Audit log', settings: 'Settings' };

let tt;
function toast(msg, sub) {
  const t = $('#tst'); t.innerHTML = msg + (sub ? '<small>' + sub + '</small>' : ''); t.classList.add('show');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2600);
}

function route() {
  let h = location.hash.slice(1); if (!names[h]) h = 'overview';
  views.forEach((v) => { v.hidden = v.id !== 'v-' + h; });
  links.forEach((a) => { const on = a.dataset.view === h; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.title = 'Vault Admin · ' + names[h];
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route); route();

// weights
const sliders = $$('.sl input[type=range]');
function weights() {
  let sum = 0; sliders.forEach((s) => { sum += +s.value; s.closest('.sl').querySelector('b').textContent = (+s.value).toFixed(1) + '%'; });
  const p = $('#wtot'), ok = Math.abs(sum - 100) < 0.05;
  p.className = 'pill ' + (ok ? 'p-ok' : 'p-r'); p.textContent = ok ? 'Weights total 100%' : 'Weights total ' + sum.toFixed(1) + '% (must be 100%)';
  return ok;
}
sliders.forEach((s) => s.addEventListener('input', weights));

// clicks
document.addEventListener('click', (e) => {
  const edit = e.target.closest('[data-edit]');
  if (edit) {
    const [n, price, stock] = edit.dataset.edit.split('|');
    $('#bn').value = n; $('#bp').value = price; $('#bi').value = stock; $('#bn').focus({ preventScroll: true });
    $('#bn').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Editing ' + n); return;
  }
  const f = e.target.closest('[data-f]'); if (f) { $$('[data-f]').forEach((c) => c.classList.toggle('on', c === f)); audit(); }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'newbox') { $('#bn').value = ''; $('#bp').value = ''; $('#bi').value = ''; $('#bz').value = ''; $('#bn').focus(); $('#bn').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('New box', 'Fill in the editor and save'); }
  else if (act === 'savebox') { if (!weights()) return toast('Weights must total 100%', 'Use Auto-balance to fix it'); toast('Box saved', ($('#bn').value || 'Untitled box') + ' · demo only'); }
  else if (act === 'balance') { const o = sliders.slice(1).reduce((a, s) => a + +s.value, 0); sliders[0].value = Math.max(0, 100 - o).toFixed(1); weights(); toast('Weights balanced', 'Common set to ' + (+sliders[0].value).toFixed(1) + '%'); }
  else if (act === 'freeze' || act === 'dismiss') {
    const tr = b.closest('tr'); if (tr.classList.contains('gone')) return;
    const cell = b.closest('td'); cell.innerHTML = '<span class="pill ' + (act === 'freeze' ? 'p-r' : 'p-ok') + '">' + (act === 'freeze' ? 'Frozen' : 'Dismissed') + '</span>';
        const open = $$('#v-flagged [data-act="freeze"]').length;
    $('#flagct').textContent = 3 + open; $('#flchip').lastChild.textContent = ' ' + (3 + open) + ' open';
    toast(act === 'freeze' ? 'Account frozen' : 'Case dismissed', tr.dataset.user);
  }
  else if (act === 'stream') {
    const card = b.closest('.stc'), live = card.dataset.state === 'live', pill = card.querySelector('.sp'), st = card.querySelector('.sm-st');
    card.dataset.state = live ? 'off' : 'live';
    pill.className = 'pill sp ' + (live ? 'p-r' : 'p-ok'); pill.textContent = live ? 'Offline' : 'Live';
    st.textContent = live ? 'Ended just now' : 'Live · 0 watching'; b.className = 'btn sm ' + (live ? 'gold' : 'red'); b.textContent = live ? 'Go live' : 'End stream';
    toast(live ? 'Stream ended' : 'Stream is live', card.querySelector('.nm b').textContent);
  }
  else if (act === 'cancelb') { const tr = b.closest('tr'); tr.classList.add('gone'); tr.querySelector('.pill').className = 'pill p-r'; tr.querySelector('.pill').textContent = 'Cancelled'; toast('Room cancelled', tr.dataset.b + ' · stakes refunded'); }
  else if (act === 'addprize') toast('Add prize', 'Prize form opens here in the live build');
  else if (act === 'sched') toast('Schedule stream', 'Calendar picker opens here in the live build');
  else if (act === 'savesettings') toast('Settings saved', 'Demo only, nothing was changed');
  else if (act === 'resetsettings') { $$('#v-settings input[type=checkbox]:not(:disabled)').forEach((c) => { c.checked = c.id !== 's_maint'; }); $('#s_dep').value = 2000; $('#s_max').value = 500; toast('Settings reset'); }
});
document.addEventListener('click', (e) => {
  const st = e.target.closest('[data-stock] button'); if (st) { const o = st.parentElement.querySelector('output'); o.textContent = Math.max(0, +o.textContent + +st.dataset.d); }
  const sw = e.target.closest('input[data-pz]'); if (sw) toast(sw.dataset.pz + (sw.checked ? ' is active' : ' is paused'));
});
$$('#v-settings input[type=checkbox]').forEach((c) => c.addEventListener('change', () => toast('Setting changed', 'Press Save settings to keep it')));

// audit filter
function audit() {
  const f = ($('[data-f].on') || {}).dataset?.f || 'all', q = $('#aq').value.trim().toLowerCase(); let n = 0;
  $$('#audb tr').forEach((r) => { const show = (f === 'all' || r.dataset.cat === f) && (!q || r.textContent.toLowerCase().includes(q)); r.hidden = !show; if (show) n++; });
  $('#audn').textContent = n ? n + ' events shown' : 'No events match';
}
$('#aq').addEventListener('input', audit); audit();
