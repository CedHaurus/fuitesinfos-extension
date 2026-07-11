/* > Fuites Infos — service worker (MV3, Chrome + Firefox).
 *
 * Rôle :
 *   - charge l'index des domaines touchés (cache local rafraîchi, sinon paquet embarqué) ;
 *   - à chaque navigation, compare le domaine courant à l'index EN LOCAL
 *     (aucune requête réseau par page visitée -> zéro fuite d'historique) ;
 *   - colore l'icône « F » (rouge = concerné, ardoise = neutre) par onglet ;
 *   - répond au popup et au content script (overlay).
 */

const B = globalThis.browser ?? globalThis.chrome;

// Endpoint de rafraîchissement (Phase 2). Vide = désactivé -> on reste sur l'embarqué.
// Route GARDÉE : exige l'en-tête X-FI-Ext (jeton HMAC quotidien) + rate-limit Cloudflare.
const REFRESH_URL = 'https://fuitesinfos.fr/api/ext/v1/domains';
const REFRESH_ENABLED = true; // endpoint déployé et validé (2026-07-10)
const REFRESH_ALARM = 'fi-refresh';
const REFRESH_PERIOD_MIN = 24 * 60; // 1×/jour
const SITE = 'https://fuitesinfos.fr';

// ---------------------------------------------------------------------------
// Index : { byHost: Map<host, entry[]>, meta }
// ---------------------------------------------------------------------------
let INDEX = null;
let loadingPromise = null;

async function loadBundled() {
  const res = await fetch(B.runtime.getURL('data/leaks-index.json'));
  return res.json();
}

function buildIndex(raw) {
  const byHost = new Map();
  for (const e of raw.entries || []) {
    if (!e.d) continue;
    const arr = byHost.get(e.d);
    if (arr) arr.push(e); else byHost.set(e.d, [e]);
  }
  return {
    byHost,
    meta: { v: raw.v, generated_at: raw.generated_at, count: raw.count ?? (raw.entries?.length || 0) },
  };
}

async function ensureIndex() {
  if (INDEX) return INDEX;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    let raw = null;
    try {
      const { cachedIndex } = await B.storage.local.get('cachedIndex');
      if (cachedIndex && Array.isArray(cachedIndex.entries)) raw = cachedIndex;
    } catch { /* ignore */ }
    if (!raw) raw = await loadBundled();
    INDEX = buildIndex(raw);
    return INDEX;
  })();
  return loadingPromise;
}

// ---------------------------------------------------------------------------
// Matching : host normalisé -> entrées. On matche l'hôte exact OU un hôte dont
// le visité est un sous-domaine (visité se termine par "." + hôte indexé).
// ---------------------------------------------------------------------------
function normHost(h) {
  if (!h) return '';
  h = h.toLowerCase().trim().replace(/\.+$/, '');
  if (h.startsWith('www.')) h = h.slice(4);
  return h;
}

function hostFromUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return normHost(url.hostname);
  } catch {
    return '';
  }
}

async function matchHost(host) {
  const idx = await ensureIndex();
  host = normHost(host);
  if (!host) return [];
  const hits = [];
  const seen = new Set();
  const labels = host.split('.');
  // Suffixes : a.b.c.fr -> b.c.fr -> c.fr (min. 2 labels). Ne matche qu'un hôte
  // réellement présent dans l'index (pas de faux positif sur un TLD/plateforme).
  for (let i = 0; i <= labels.length - 2; i++) {
    const cand = labels.slice(i).join('.');
    const arr = idx.byHost.get(cand);
    if (arr) {
      for (const e of arr) {
        if (!seen.has(e.id || e.n + e.y)) { seen.add(e.id || e.n + e.y); hits.push(e); }
      }
    }
  }
  // Récentes d'abord.
  hits.sort((a, b) => (b.y || '').localeCompare(a.y || ''));
  return hits;
}

// ---------------------------------------------------------------------------
// Icône par onglet
// ---------------------------------------------------------------------------
const ICON_SIZES = [16, 32, 48, 128];
const iconCache = {}; // state -> { taille: ImageData }

// Dans un service worker MV3, setIcon({path}) est peu fiable (pas de DOM).
// On charge donc les PNG en ImageData (createImageBitmap + OffscreenCanvas),
// méthode robuste sur Chrome ET Firefox.
async function iconFor(state) {
  if (iconCache[state]) return iconCache[state];
  const pairs = await Promise.all(ICON_SIZES.map(async (s) => {
    const res = await fetch(B.runtime.getURL(`icons/f-${state}-${s}.png`));
    const bmp = await createImageBitmap(await res.blob());
    const canvas = new OffscreenCanvas(s, s);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, s, s);
    return [s, ctx.getImageData(0, 0, s, s)];
  }));
  return (iconCache[state] = Object.fromEntries(pairs));
}

async function setActionIcon(tabId, state) {
  try {
    await B.action.setIcon({ tabId, imageData: await iconFor(state) });
  } catch {
    // Repli : chemins (certaines versions/navigateurs les acceptent en SW).
    try {
      await B.action.setIcon({
        tabId,
        path: Object.fromEntries(ICON_SIZES.map((s) => [s, `icons/f-${state}-${s}.png`])),
      });
    } catch { /* onglet fermé */ }
  }
}

async function paintTab(tabId, hits) {
  const alert = hits.length > 0;
  try {
    await setActionIcon(tabId, alert ? 'alert' : 'idle');
    await B.action.setBadgeText({ tabId, text: alert ? String(hits.length) : '' });
    if (alert) {
      await B.action.setBadgeBackgroundColor({ tabId, color: '#b91c1c' });
      await B.action.setTitle({ tabId, text: `Fuites Infos — ${hits.length} fuite(s) concernant ce site` });
    } else {
      await B.action.setTitle({ tabId, text: 'Fuites Infos — aucune fuite connue pour ce site' });
    }
  } catch { /* onglet fermé entre-temps */ }
}

async function evaluateTab(tabId, url) {
  const host = hostFromUrl(url || '');
  if (!host) { await paintTab(tabId, []); return []; }
  const hits = await matchHost(host);
  await paintTab(tabId, hits);
  return hits;
}

// ---------------------------------------------------------------------------
// Événements navigateur
// ---------------------------------------------------------------------------
B.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    evaluateTab(tabId, tab.url || changeInfo.url);
  }
});

B.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await B.tabs.get(tabId);
    evaluateTab(tabId, tab.url);
  } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// Messagerie (popup + content script)
// ---------------------------------------------------------------------------
B.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'checkHost') {
      // content script -> "ce host est-il concerné ?"
      const hits = await matchHost(msg.host || '');
      sendResponse({ hits, site: SITE });
      return;
    }
    if (msg?.type === 'getPopupData') {
      // popup -> état de l'onglet actif
      const [tab] = await B.tabs.query({ active: true, currentWindow: true });
      const host = hostFromUrl(tab?.url || '');
      const hits = host ? await matchHost(host) : [];
      const idx = await ensureIndex();
      sendResponse({ host, hits, site: SITE, meta: idx.meta });
      return;
    }
    sendResponse({});
  })();
  return true; // réponse asynchrone
});

// ---------------------------------------------------------------------------
// Rafraîchissement quotidien (Phase 2 — désactivé tant que l'endpoint n'existe pas)
// ---------------------------------------------------------------------------
async function decryptEnc(base64) {
  // eslint-disable-next-line no-undef
  if (typeof self.INDEX_KEY_B64 !== 'string') throw new Error('clé absente');
  const b = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const iv = b.slice(0, 12);
  const tagAndCt = b.slice(12);
  const rawKey = Uint8Array.from(atob(self.INDEX_KEY_B64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, tagAndCt);
  return JSON.parse(new TextDecoder().decode(plain));
}

/** Jeton d'accès quotidien : hex(HMAC-SHA256(secret, "FI-EXT-v1|" + AAAA-MM-JJ UTC)).
 *  Change chaque jour UTC ; le serveur accepte le jour courant et la veille (fuseau/skew). */
async function dailyExtToken() {
  if (typeof self.EXT_TOKEN_SECRET_B64 !== 'string') return '';
  const day = new Date().toISOString().slice(0, 10); // AAAA-MM-JJ (UTC)
  const rawKey = Uint8Array.from(atob(self.EXT_TOKEN_SECRET_B64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`FI-EXT-v1|${day}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function refreshIndex() {
  if (!REFRESH_ENABLED) return;
  try {
    const token = await dailyExtToken();
    const res = await fetch(REFRESH_URL, {
      cache: 'no-cache',
      headers: token ? { 'X-FI-Ext': token } : {},
    });
    if (!res.ok) return;
    const raw = await decryptEnc(await res.text());
    if (!Array.isArray(raw.entries)) return;
    await B.storage.local.set({ cachedIndex: raw, cachedAt: Date.now() });
    INDEX = buildIndex(raw);
  } catch (e) {
    console.warn('[Fuites Infos] refresh échoué :', e);
  }
}

// Chrome (service worker) : charge la clé via importScripts. Firefox (event page) :
// index-key.js est déjà chargé via background.scripts (voir manifest).
if (typeof importScripts === 'function') {
  try { importScripts('index-key.js'); } catch { /* clé optionnelle */ }
}

B.runtime.onInstalled.addListener(() => {
  if (REFRESH_ENABLED) {
    B.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_PERIOD_MIN });
    refreshIndex();
  }
  ensureIndex();
});

B.alarms.onAlarm.addListener((a) => {
  if (a.name === REFRESH_ALARM) refreshIndex();
});

ensureIndex();
