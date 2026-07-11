/* > Fuites Infos — popup. Interroge le service worker sur l'onglet actif. */
(() => {
  const B = globalThis.browser ?? globalThis.chrome;
  const app = document.getElementById('app');
  const content = document.getElementById('content');
  const metaEl = document.getElementById('meta');
  const siteLink = document.getElementById('siteLink');
  const logo = document.getElementById('logo');
  const setLogo = (state) => { logo.src = B.runtime.getURL(`icons/f-${state}-48.png`); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function frDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return iso || '';
    const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
      'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return `${parseInt(m[3], 10)} ${mois[parseInt(m[2], 10) - 1]} ${m[1]}`;
  }
  const isConf = (s) => (s || '').toLowerCase().startsWith('confir');

  function renderAlert(host, hits, site) {
    app.className = 'state-alert';
    setLogo('alert');
    const cards = hits.slice(0, 4).map((h) => `
      <div class="card">
        <div class="name">${esc(h.n)}</div>
        <div class="row">
          <span class="badge ${isConf(h.s) ? 'conf' : 'rev'}">${esc(h.s || '')}</span>
          <span class="date">${esc(frDate(h.y))}</span>
        </div>
      </div>`).join('');
    const extra = hits.length > 4 ? `<div class="more">+ ${hits.length - 4} autre(s) incident(s)</div>` : '';
    const top = hits[0];
    const link = top.id ? `${site}/?leak=${encodeURIComponent(top.id)}` : site;
    content.innerHTML = `
      <p class="alert-title">Ce site ou cette entité a déjà laissé fuiter des données.</p>
      ${cards}${extra}
      <a class="cta" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Détails sur fuitesinfos.fr</a>
    `;
  }

  function renderOk(host) {
    app.className = 'state-ok';
    content.innerHTML = `
      <div class="ok-wrap">
        <div class="ok-ic">✓</div>
        <div class="ok-title">Aucune fuite connue</div>
        <div class="ok-sub">Ce site n'apparaît pas dans la base Fuites Infos.</div>
        ${host ? `<div class="host">${esc(host)}</div>` : ''}
      </div>`;
  }

  function renderNeutral() {
    app.className = 'state-neutral';
    content.innerHTML = `
      <div class="ok-wrap">
        <div class="ok-ic" style="background:#e5e7eb;color:#6b7280">—</div>
        <div class="ok-title">Page non analysable</div>
        <div class="ok-sub">Ouvrez un site web pour lancer la vérification.</div>
      </div>`;
  }

  B.runtime.sendMessage({ type: 'getPopupData' }, (resp) => {
    if (B.runtime.lastError || !resp) { renderNeutral(); return; }
    const { host, hits, site, meta } = resp;
    if (site) siteLink.href = site;
    if (meta?.count) metaEl.textContent = `${meta.count} entités suivies`;
    if (!host) { renderNeutral(); return; }
    if (hits && hits.length) renderAlert(host, hits, site || 'https://fuitesinfos.fr');
    else renderOk(host);
  });
})();
