/* > Fuites Infos — popup. Interroge le service worker sur l'onglet actif. */
(() => {
  const B = globalThis.browser ?? globalThis.chrome;
  const app = document.getElementById('app');
  const content = document.getElementById('content');
  const metaEl = document.getElementById('meta');
  const siteLink = document.getElementById('siteLink');
  const logo = document.getElementById('logo');
  const setLogo = (state) => { logo.src = B.runtime.getURL(`icons/f-${state}-48.png`); };

  // Helper DOM : construit des nœuds (jamais d'innerHTML avec des valeurs dynamiques).
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) n.append(c);
    return n;
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
    const cards = hits.slice(0, 4).map((h) =>
      el('div', { class: 'card' },
        el('div', { class: 'name', text: h.n || '' }),
        el('div', { class: 'row' },
          el('span', { class: `badge ${isConf(h.s) ? 'conf' : 'rev'}`, text: h.s || '' }),
          el('span', { class: 'date', text: frDate(h.y) }),
        ),
      ));
    const top = hits[0];
    const link = top.id ? `${site}/?leak=${encodeURIComponent(top.id)}` : site;
    content.replaceChildren(
      el('p', { class: 'alert-title', text: 'Ce site ou cette entité a déjà laissé fuiter des données.' }),
      ...cards,
      hits.length > 4 ? el('div', { class: 'more', text: `+ ${hits.length - 4} autre(s) incident(s)` }) : document.createComment(''),
      el('a', { class: 'cta', href: link, target: '_blank', rel: 'noopener noreferrer', text: 'Détails sur fuitesinfos.fr' }),
    );
  }

  function renderOk(host) {
    app.className = 'state-ok';
    content.replaceChildren(
      el('div', { class: 'ok-wrap' },
        el('div', { class: 'ok-ic', text: '✓' }),
        el('div', { class: 'ok-title', text: 'Aucune fuite connue' }),
        el('div', { class: 'ok-sub', text: "Ce site n'apparaît pas dans la base Fuites Infos." }),
        host ? el('div', { class: 'host', text: host }) : null,
      ),
    );
  }

  function renderNeutral() {
    app.className = 'state-neutral';
    const ic = el('div', { class: 'ok-ic', text: '—' });
    ic.style.background = '#e5e7eb';
    ic.style.color = '#6b7280';
    content.replaceChildren(
      el('div', { class: 'ok-wrap' },
        ic,
        el('div', { class: 'ok-title', text: 'Page non analysable' }),
        el('div', { class: 'ok-sub', text: 'Ouvrez un site web pour lancer la vérification.' }),
      ),
    );
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
