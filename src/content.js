/* > Fuites Infos — content script.
 * Demande au service worker si le domaine courant est concerné par une fuite ;
 * si oui, affiche un overlay rouge centré (isolé du CSS de la page via Shadow DOM).
 * Clic hors de la fenêtre OU clic sur la croix -> fermeture.
 */
(() => {
  const B = globalThis.browser ?? globalThis.chrome;
  if (window.top !== window) return; // pas dans les iframes

  const host = location.hostname;
  if (!host) return;

  // Ne pas re-afficher pour ce host dans cet onglet si déjà fermé.
  const KEY = 'fi-dismissed:' + host;
  try { if (sessionStorage.getItem(KEY)) return; } catch { /* ignore */ }

  B.runtime.sendMessage({ type: 'checkHost', host }, (resp) => {
    if (B.runtime.lastError) return;
    if (!resp || !resp.hits || resp.hits.length === 0) return;
    render(resp.hits, resp.site || 'https://fuitesinfos.fr');
  });

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

  function render(hits, site) {
    if (document.getElementById('fuites-infos-overlay-host')) return;

    const confirmed = hits.some((h) => (h.s || '').toLowerCase().startsWith('confir'));
    const statut = confirmed ? 'confirmée' : 'revendiquée';
    const top = hits[0];
    const link = top.id ? `${site}/?leak=${encodeURIComponent(top.id)}` : site;

    const iconUrl = B.runtime.getURL('icons/f-alert-128.png');
    const holder = document.createElement('div');
    holder.id = 'fuites-infos-overlay-host';
    holder.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647;';
    const root = holder.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      .backdrop {
        position: fixed; inset: 0; background: rgba(10, 10, 12, 0.55);
        backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center;
        padding: 24px; animation: fade .18s ease-out;
      }
      @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
      .card {
        position: relative; width: min(520px, 100%);
        background: #fff; border-radius: 16px; overflow: hidden;
        box-shadow: 0 24px 60px rgba(0,0,0,.4); border-top: 6px solid #dc2626;
        animation: pop .2s ease-out;
      }
      .body { padding: 30px 30px 26px; text-align: center; }
      .mark { width: 56px; height: 56px; border-radius: 14px; margin: 0 auto 16px; object-fit: cover; display: block; }
      h1 { color: #dc2626; font-size: 20px; font-weight: 800; line-height: 1.3; margin-bottom: 6px; }
      .paren { color: #b91c1c; font-weight: 700; }
      .entity { margin-top: 12px; color: #111827; font-size: 15px; font-weight: 600; }
      .meta { margin-top: 4px; color: #6b7280; font-size: 13px; }
      .more { margin-top: 6px; color: #9ca3af; font-size: 12px; }
      .cta {
        display: inline-block; margin-top: 20px; padding: 11px 20px; border-radius: 10px;
        background: #dc2626; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px;
      }
      .cta:hover { background: #b91c1c; }
      .foot { margin-top: 14px; color: #9ca3af; font-size: 11px; }
      .close {
        position: absolute; top: 10px; right: 10px; width: 32px; height: 32px;
        border: none; border-radius: 8px; background: #f3f4f6; color: #6b7280;
        font-size: 20px; line-height: 1; cursor: pointer;
      }
      .close:hover { background: #e5e7eb; color: #111827; }
    `;

    const card = el('div', { class: 'card', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Alerte fuite de données' },
      el('button', { class: 'close', title: 'Fermer', 'aria-label': 'Fermer', text: '×' }),
      el('div', { class: 'body' },
        el('img', { class: 'mark', src: iconUrl, alt: '' }),
        el('h1', null,
          "Ce site internet ou cette entreprise a été victime d'une fuite de données ",
          el('span', { class: 'paren', text: `(${statut})` }),
        ),
        el('div', { class: 'entity', text: top.n || '' }),
        el('div', { class: 'meta', text: `Fuite ${statut} — ${frDate(top.y)}` }),
        hits.length > 1 ? el('div', { class: 'more', text: `+ ${hits.length - 1} autre(s) incident(s) recensé(s)` }) : null,
        el('a', { class: 'cta', href: link, target: '_blank', rel: 'noopener noreferrer', text: 'Voir sur fuitesinfos.fr' }),
        el('div', { class: 'foot', text: 'Source : fuitesinfos.fr' }),
      ),
    );
    root.append(style, el('div', { class: 'backdrop', part: 'backdrop' }, card));

    (document.body || document.documentElement).appendChild(holder);

    const close = () => {
      try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
      holder.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };

    root.querySelector('.close').addEventListener('click', close);
    root.querySelector('.backdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close(); // clic hors de la carte
    });
    document.addEventListener('keydown', onKey, true);
  }
})();
