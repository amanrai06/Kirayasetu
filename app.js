// =============================================================
//  KirayaSetu — main app (plain JS, no build step)
// =============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const CFG = window.KS_CONFIG;
const sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
const app = document.getElementById('app');
const BUCKET = 'room-media';

const S = {
  session: null, profile: null, phone: null,
  peer: null, call: null, callStream: null,
  maps: [], viewCh: [], globalCh: null, camStream: null,
  reqTab: null, installEvt: null, draft: null,
};
const uid = () => S.session?.user?.id;

// ---------- small helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupee = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const go = path => { if (location.hash === '#/' + path) render(); else location.hash = '#/' + path; };
const initial = name => esc((name || '?').trim().charAt(0).toUpperCase());
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 3600);
}

function timeAgo(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'abhi';
  if (s < 3600) return Math.floor(s / 60) + ' min pehle';
  if (s < 86400) return Math.floor(s / 3600) + ' ghante pehle';
  return Math.floor(s / 86400) + ' din pehle';
}
const daysSince = d => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
const clock = d => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

const avatarHtml = (p, cls = 'avatar') => p?.avatar_url
  ? `<img class="${cls}" src="${esc(p.avatar_url)}" alt="" referrerpolicy="no-referrer">`
  : `<div class="${cls}">${initial(p?.full_name)}</div>`;

const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5z"/><path d="M9 4v13M15 6.5v13"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/></svg>',
  wa: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z"/></svg>',
};

const L_ROOM = { room: 'Kamra', '1rk': '1 RK', '1bhk': '1 BHK', '2bhk': '2 BHK', pg: 'PG', shared: 'Sharing' };
const L_FURN = { unfurnished: 'Bina furniture', semi: 'Thoda furnished', full: 'Poora furnished' };
const L_ELEC = { included: 'Kiraye mein shamil', separate: 'Alag se', meter: 'Sub-meter se' };
const L_TEN = { any: 'Koi bhi', family: 'Sirf family', bachelor: 'Bachelor chalega', girls: 'Sirf ladkiyan', boys: 'Sirf ladke' };
const L_FOOD = { any: 'Koi rok nahi', veg: 'Sirf veg' };
const L_STATUS = { pending: 'Jawab ka intezaar', approved: 'Approved', rejected: 'Mana kar diya', visited: 'Kamra dekh liya', done: 'Deal pakki', cancelled: 'Cancel' };
const STATUS_PILL = { pending: 'genda', approved: 'green', rejected: 'red', visited: 'green', done: 'green', cancelled: 'grey' };
const AMENITIES = ['Attached bathroom', 'Kitchen', 'Parking', 'WiFi', 'Cooler/AC', 'Almari', 'Geyser', 'Chhat', 'Pani 24 ghante', 'Inverter'];
const LANGS = [
  ['hi-IN', 'हिंदी / Haryanvi'], ['pa-IN', 'ਪੰਜਾਬੀ'], ['bn-IN', 'বাংলা'], ['mr-IN', 'मराठी'], ['gu-IN', 'ગુજરાતી'],
  ['ta-IN', 'தமிழ்'], ['te-IN', 'తెలుగు'], ['kn-IN', 'ಕನ್ನಡ'], ['ml-IN', 'മലയാളം'], ['ur-IN', 'اردو'], ['en-IN', 'English'],
];

// ---------- geo ----------
function getGPS(fresh = false) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Is phone/browser mein location support nahi hai'));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      e => rej(new Error(e.code === 1 ? 'Location ki permission do — browser ke address bar mein 🔒 dabao → Location → Allow' : 'Location nahi mili. Khuli jagah pe dobara try karo.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: fresh ? 0 : 120000 });
  });
}
const gmapsDir = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

function makeMap(el, center, zoom = 14) {
  const m = L.map(el, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap',
  }).addTo(m);
  S.maps.push(m);
  setTimeout(() => m.invalidateSize(), 200);
  return m;
}
const rentIcon = rent => L.divIcon({ className: 'map-tag', html: `<span class="tag">${rupee(rent)}</span>`, iconSize: null, iconAnchor: [0, 14] });
const pinIcon = () => L.divIcon({ className: '', html: '<svg viewBox="0 0 24 32" width="30" height="40"><path d="M12 0C5.4 0 0 5.3 0 11.8 0 20.6 12 32 12 32s12-11.4 12-20.2C24 5.3 18.6 0 12 0z" fill="#2F4BB8"/><circle cx="12" cy="12" r="4.5" fill="#F5B301"/></svg>', iconSize: [30, 40], iconAnchor: [15, 40] });
const meIcon = () => L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

// =============================================================
//  BOOT + ROUTER
// =============================================================
async function boot() {
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  if (S.session) await loadMe();
  sb.auth.onAuthStateChange(async (evt, session) => {
    const was = uid();
    S.session = session;
    if (evt === 'SIGNED_IN' && session?.user?.id !== was) { await loadMe(); render(); }
    if (evt === 'SIGNED_OUT') { teardownMe(); render(); }
  });
  window.addEventListener('hashchange', render);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  // clean the #access_token fragment Supabase leaves after Google login
  if (location.hash.includes('access_token') || location.hash.includes('error_description')) history.replaceState(null, '', location.pathname + '#/');
  render();
}

async function loadMe() {
  const id = uid();
  const [{ data: prof }, { data: priv }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', id).maybeSingle(),
    sb.from('profile_private').select('phone').eq('id', id).maybeSingle(),
  ]);
  S.profile = prof || { id, full_name: S.session.user.user_metadata?.full_name, avatar_url: S.session.user.user_metadata?.avatar_url };
  S.phone = priv?.phone || '';
  startPeer();
  subscribeGlobal();
  refreshBadge();
}

function teardownMe() {
  S.profile = null; S.phone = null;
  if (S.globalCh) sb.removeChannel(S.globalCh);
  S.globalCh = null;
  try { S.peer?.destroy(); } catch { }
  S.peer = null;
  $('#online-dot').classList.remove('on');
}

const needsOnboard = () => !S.profile?.role || !S.phone;

function cleanupView() {
  S.maps.forEach(m => { try { m.remove(); } catch { } });
  S.maps = [];
  S.viewCh.forEach(c => sb.removeChannel(c));
  S.viewCh = [];
  stopCamStream();
  stopListening();
}

const ROUTES = [
  [/^$/, () => go(S.profile?.role === 'landlord' ? 'my' : 'search')],
  [/^search$/, viewSearch],
  [/^room\/([\w-]+)$/, viewRoom],
  [/^add$/, viewAdd],
  [/^my$/, viewMy],
  [/^requests$/, viewRequests],
  [/^chat\/([\w-]+)$/, viewChat],
  [/^profile$/, viewProfile],
  [/^onboard$/, viewOnboard],
];

async function render() {
  cleanupView();
  window.scrollTo(0, 0);
  const path = location.hash.replace(/^#\/?/, '').split('?')[0];
  const nav = $('#nav');
  if (!S.session) {
    if (path && path !== 'login') store.set('ks_after_login', path);
    nav.hidden = true;
    return viewLogin();
  }
  if (needsOnboard() && path !== 'onboard') return go('onboard');
  nav.hidden = path === 'onboard';
  const after = store.get('ks_after_login', null);
  if (after && path === '') { store.set('ks_after_login', null); return go(after); }
  $$('#nav a').forEach(a => a.classList.toggle('on', path.startsWith(a.dataset.r) || (a.dataset.r === 'my' && path === 'add')));
  for (const [re, fn] of ROUTES) {
    const m = path.match(re);
    if (m) {
      try { await fn(...m.slice(1)); } catch (e) { console.error(e); app.innerHTML = errorBox(e); }
      return;
    }
  }
  go('');
}
const errorBox = e => `<div class="empty"><h3>Kuch gadbad ho gayi</h3><p>${esc(e.message || e)}</p><button class="btn" onclick="location.reload()">Dobara kholo</button></div>`;

// =============================================================
//  LOGIN + ONBOARDING
// =============================================================
function viewLogin() {
  app.innerHTML = `
  <section class="hero">
    <h1>Kamra dhoondhna, ab ghar-ghar bhatakna nahi.</h1>
    <p>Apne budget mein, apne paas ke khaali kamre. Asli photo, asli location — aur aapka number tab tak chhupa, jab tak aap khud haan na karo.</p>
  </section>
  <div class="hero-board">
    <span class="tag big">Khaali hai</span>
    <ul>
      <li>${ICON.pin}<span><b>Kiraye wale:</b> budget daalo, map pe paas ke kamre dekho, bina number diye call karo.</span></li>
      <li>${ICON.mic}<span><b>Makaan malik:</b> apni bhasha mein bol ke kamra daalo — form apne-aap bharega.</span></li>
      <li>${ICON.cam}<span><b>Bharosa:</b> photo sirf live camera se, kamre pe khade hokar GPS ke saath.</span></li>
    </ul>
  </div>
  <button id="glogin" class="btn block gbtn">
    <svg viewBox="0 0 48 48" aria-hidden="true" style="width:20px;height:20px;stroke:none"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>Google se login karo
  </button>
  <p class="small muted" style="text-align:center;margin-top:12px">Login karke aap <a href="/privacy.html">privacy niyam</a> maante hain.</p>`;
  $('#glogin').onclick = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/' } });
    if (error) toast(error.message, 'bad');
  };
}

function viewOnboard() {
  const p = S.profile || {};
  let role = p.role || '';
  app.innerHTML = `
  <div class="stack">
    <div class="person" style="grid-template-columns:48px 1fr">${avatarHtml(p)}<div><h2>Namaste${p.full_name ? ', ' + esc(p.full_name.split(' ')[0]) : ''}!</h2><p class="muted small">Bas 3 cheezein, phir shuru.</p></div></div>
    <div class="field"><span>Aap kya chahte ho?</span>
      <div class="roles">
        <button class="role ${role === 'tenant' ? 'on' : ''}" data-role="tenant"><b>Kamra chahiye</b><span class="small muted">Main kiraye pe rehna chahta/chahti hoon</span></button>
        <button class="role ${role === 'landlord' ? 'on' : ''}" data-role="landlord"><b>Kamra dena hai</b><span class="small muted">Mere paas khaali kamra hai</span></button>
      </div>
      <small>Baad mein Profile se badal sakte ho.</small>
    </div>
    <label class="field"><span>Naam</span><input id="ob-name" class="input" value="${esc(p.full_name)}" autocomplete="name"></label>
    <label class="field"><span>Mobile number</span><input id="ob-phone" class="input" inputmode="numeric" maxlength="10" placeholder="10 digit" value="${esc(S.phone)}" autocomplete="tel-national">
      <small>${ICON.lock.replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px;fill:none;stroke:currentColor;stroke-width:2"')} Kisi ko nahi dikhega jab tak aap request approve na karo.</small></label>
    <label class="field"><span>Shehar</span><input id="ob-city" class="input" placeholder="Jaise Panipat" value="${esc(p.city)}"></label>
    <button id="ob-save" class="btn block">Shuru karo</button>
  </div>`;
  $$('.role').forEach(b => b.onclick = () => { role = b.dataset.role; $$('.role').forEach(x => x.classList.toggle('on', x === b)); });
  $('#ob-save').onclick = async () => {
    const name = $('#ob-name').value.trim(), phone = $('#ob-phone').value.replace(/\D/g, ''), city = $('#ob-city').value.trim();
    if (!role) return toast('Pehle chuno: kamra chahiye ya dena hai', 'bad');
    if (!name) return toast('Naam likho', 'bad');
    if (!/^[6-9]\d{9}$/.test(phone)) return toast('Sahi 10 digit mobile number daalo', 'bad');
    $('#ob-save').disabled = true;
    const r1 = await sb.from('profiles').update({ full_name: name, role, city }).eq('id', uid());
    const r2 = await sb.from('profile_private').upsert({ id: uid(), phone });
    $('#ob-save').disabled = false;
    if (r1.error || r2.error) return toast((r1.error || r2.error).message, 'bad');
    Object.assign(S.profile, { full_name: name, role, city });
    S.phone = phone;
    toast('Profile ban gayi ✅', 'good');
    go(role === 'landlord' ? 'add' : 'search');
  };
}

// =============================================================
//  SEARCH (tenant)
// =============================================================
const BUDGETS = [[0, 2500, '₹2,500 tak'], [2500, 4000, '₹2.5k–4k'], [4000, 6000, '₹4k–6k'], [6000, 10000, '₹6k–10k'], [10000, 100000, '₹10k+']];

async function viewSearch() {
  const f = store.get('ks_filters', { min: 0, max: 6000, type: null, radius: 5, center: null, place: '' });
  app.innerHTML = `
  <h2 style="margin-bottom:12px">Apne budget mein kamra</h2>
  <div class="searchbar">
    <button id="s-gps" class="btn ghost" aria-label="Meri location">${ICON.pin.replace('<svg', '<svg style="width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2"')}</button>
    <form id="s-place"><input id="s-q" class="input" placeholder="Jagah likho — jaise Model Town, Panipat" value="${esc(f.place)}" enterkeyhint="search"></form>
  </div>
  <div id="s-places"></div>
  <div class="card section stack" style="gap:10px">
    <div><p class="chip-label">Budget (mahina)</p><div class="chips" id="c-budget">
      ${BUDGETS.map(([a, b, t]) => `<button class="chip ${f.min === a && f.max === b ? 'on' : ''}" data-a="${a}" data-b="${b}">${t}</button>`).join('')}</div>
      <div class="grid2" style="margin-top:8px"><input id="s-min" class="input" inputmode="numeric" value="${f.min}" aria-label="Kam se kam"><input id="s-max" class="input" inputmode="numeric" value="${f.max}" aria-label="Zyada se zyada"></div></div>
    <div><p class="chip-label">Kamre ka type</p><div class="chips" id="c-type">
      <button class="chip ${!f.type ? 'on' : ''}" data-v="">Sab</button>
      ${Object.entries(L_ROOM).map(([k, v]) => `<button class="chip ${f.type === k ? 'on' : ''}" data-v="${k}">${v}</button>`).join('')}</div></div>
    <div><p class="chip-label">Kitni door tak</p><div class="chips" id="c-rad">
      ${[1, 2, 5, 10, 25].map(r => `<button class="chip ${f.radius === r ? 'on' : ''}" data-v="${r}">${r} km</button>`).join('')}</div></div>
  </div>
  <div class="section"><div id="s-map" class="map"></div></div>
  <div class="results-head"><h2 id="s-count">…</h2><span class="small muted" id="s-where"></span></div>
  <div id="s-list" class="list"></div>`;

  const save = () => store.set('ks_filters', f);
  let map, layer, meMarker, circle;

  const ensureMap = () => {
    if (map) return;
    map = makeMap($('#s-map'), f.center || { lat: 22.5, lng: 79 }, f.center ? 13 : 5);
    layer = L.layerGroup().addTo(map);
  };

  async function run() {
    save();
    if (!f.center) {
      ensureMap();
      $('#s-count').textContent = 'Location chahiye';
      $('#s-list').innerHTML = `<div class="empty card"><h3>Aap kahan kamra dhoondh rahe ho?</h3><p>📍 button dabao ya upar jagah ka naam likho.</p></div>`;
      return;
    }
    ensureMap();
    const { data, error } = await sb.rpc('search_listings', {
      p_lat: f.center.lat, p_lng: f.center.lng, p_radius_km: f.radius,
      p_min_rent: Number(f.min) || 0, p_max_rent: Number(f.max) || 1000000, p_room_type: f.type || null,
    });
    if (error) return toast(error.message, 'bad');
    layer.clearLayers();
    if (meMarker) meMarker.remove(); if (circle) circle.remove();
    meMarker = L.marker([f.center.lat, f.center.lng], { icon: meIcon() }).addTo(map);
    circle = L.circle([f.center.lat, f.center.lng], { radius: f.radius * 1000, color: '#2F4BB8', weight: 1.5, fillOpacity: .04 }).addTo(map);
    map.fitBounds(circle.getBounds(), { padding: [10, 10] });
    data.forEach(l => {
      L.circle([l.approx_lat, l.approx_lng], { radius: 350, color: '#F5B301', weight: 1, fillOpacity: .15 }).addTo(layer);
      L.marker([l.approx_lat, l.approx_lng], { icon: rentIcon(l.rent) }).on('click', () => go('room/' + l.id)).addTo(layer);
    });
    $('#s-count').textContent = data.length ? `${data.length} kamre mile` : 'Koi kamra nahi mila';
    $('#s-where').textContent = f.place ? f.place.split(',')[0] : 'aapke paas';
    $('#s-list').innerHTML = data.length ? data.map(roomCard).join('') :
      `<div class="empty card"><h3>Is budget mein abhi kuch nahi</h3><p>Budget thoda badhao ya door tak dekho (${f.radius < 25 ? 'jaise ' + (f.radius < 10 ? f.radius * 2 : 25) + ' km' : 'doosri jagah'}).</p></div>`;
  }

  // chips
  $$('#c-budget .chip').forEach(b => b.onclick = () => {
    f.min = +b.dataset.a; f.max = +b.dataset.b; $('#s-min').value = f.min; $('#s-max').value = f.max;
    $$('#c-budget .chip').forEach(x => x.classList.toggle('on', x === b)); run();
  });
  const onRange = () => { f.min = +$('#s-min').value.replace(/\D/g, '') || 0; f.max = +$('#s-max').value.replace(/\D/g, '') || 0; $$('#c-budget .chip').forEach(x => x.classList.remove('on')); run(); };
  $('#s-min').onchange = onRange; $('#s-max').onchange = onRange;
  $$('#c-type .chip').forEach(b => b.onclick = () => { f.type = b.dataset.v || null; $$('#c-type .chip').forEach(x => x.classList.toggle('on', x === b)); run(); });
  $$('#c-rad .chip').forEach(b => b.onclick = () => { f.radius = +b.dataset.v; $$('#c-rad .chip').forEach(x => x.classList.toggle('on', x === b)); run(); });

  $('#s-gps').onclick = async () => {
    try { toast('Location le rahe hain…'); const g = await getGPS(true); f.center = { lat: g.lat, lng: g.lng }; f.place = ''; $('#s-q').value = ''; run(); }
    catch (e) { toast(e.message, 'bad'); }
  };
  $('#s-place').onsubmit = async e => {
    e.preventDefault();
    const q = $('#s-q').value.trim(); if (!q) return;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&limit=5&accept-language=en&q=${encodeURIComponent(q)}`);
      const res = await r.json();
      if (!res.length) return toast('Yeh jagah nahi mili — spelling check karo ya shehar ka naam saath likho', 'bad');
      $('#s-places').innerHTML = `<div class="place-results">${res.map((p, i) => `<button data-i="${i}">${esc(p.display_name)}</button>`).join('')}</div>`;
      $$('#s-places button').forEach(b => b.onclick = () => {
        const p = res[+b.dataset.i]; f.center = { lat: +p.lat, lng: +p.lon }; f.place = p.display_name;
        $('#s-q').value = p.display_name.split(',').slice(0, 2).join(','); $('#s-places').innerHTML = ''; run();
      });
    } catch { toast('Jagah dhoondhne mein dikkat — internet check karo', 'bad'); }
  };

  // live: naya kamra aate hi list update
  let t;
  const ch = sb.channel('search-live').on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => {
    clearTimeout(t); t = setTimeout(run, 700);
  }).subscribe();
  S.viewCh.push(ch);

  if (!f.center) {
    try { const g = await getGPS(); f.center = { lat: g.lat, lng: g.lng }; } catch { /* user will pick */ }
  }
  run();
}

function roomCard(l) {
  const img = l.photos?.[0];
  return `<a class="card room-card" href="#/room/${l.id}">
    <div class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}</div>
    <div class="body">
      <span class="tag">${rupee(l.rent)}<small>/mahina</small></span>
      <h3>${esc(l.title)}</h3>
      <p class="small muted">${esc(l.locality || l.city || '')}${l.distance_km != null ? ' · ' + (l.distance_km < 1 ? Math.round(l.distance_km * 1000) + ' m' : l.distance_km.toFixed(1) + ' km') + ' door' : ''}</p>
      <div class="row" style="gap:6px">
        <span class="pill">${L_ROOM[l.room_type] || ''}</span>
        ${l.media_verified ? `<span class="pill green">${ICON.check}Live photo</span>` : ''}
      </div>
    </div></a>`;
}

// =============================================================
//  ROOM PAGE
// =============================================================
async function viewRoom(id) {
  app.innerHTML = '<div class="boot">Kamra khul raha hai…</div>';
  const { data: l, error } = await sb.from('listings')
    .select('*, landlord:profiles!listings_landlord_id_fkey(id,full_name,avatar_url,created_at)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!l) { app.innerHTML = `<div class="empty"><h3>Yeh kamra ab available nahi hai</h3><p>Shayad kiraye pe chala gaya ya hata diya gaya.</p><a class="btn" href="#/search">Aur kamre dekho</a></div>`; return; }

  const mine = l.landlord_id === uid();
  let req = null, priv = null, phone = null;
  if (!mine) {
    const r = await sb.from('requests').select('*').eq('listing_id', id).eq('tenant_id', uid()).maybeSingle();
    req = r.data;
  }
  const unlocked = mine || (req && ['approved', 'visited', 'done'].includes(req.status));
  if (unlocked) {
    const p = await sb.from('listing_private').select('*').eq('listing_id', id).maybeSingle();
    priv = p.data;
    if (!mine) {
      const ph = await sb.from('profile_private').select('phone').eq('id', l.landlord_id).maybeSingle();
      phone = ph.data?.phone;
    }
  }
  const { data: rts } = await sb.from('ratings').select('stars').eq('to_user', l.landlord_id);
  const avg = rts?.length ? (rts.reduce((a, b) => a + b.stars, 0) / rts.length).toFixed(1) : null;
  let myRating = null;
  if (req && ['visited', 'done'].includes(req.status)) {
    const r = await sb.from('ratings').select('id').eq('request_id', req.id).eq('from_user', uid()).maybeSingle();
    myRating = r.data;
  }

  const media = [...(l.photos || []).map(u => `<img src="${esc(u)}" alt="Kamre ki photo">`), l.video_url ? `<video src="${esc(l.video_url)}" controls playsinline preload="metadata"></video>` : ''].join('');

  app.innerHTML = `
  ${media ? `<div class="gallery">${media}</div>` : ''}
  <div class="section stack" style="gap:8px">
    <div class="row" style="justify-content:space-between"><span class="tag big">${rupee(l.rent)}<small>/mahina</small></span>
      ${l.status !== 'live' ? `<span class="pill ${l.status === 'rented' ? 'green' : 'grey'}">${l.status === 'rented' ? 'Kiraye pe chala gaya' : 'Chhupa hua'}</span>` : ''}</div>
    <h1 style="font-size:1.6rem">${esc(l.title)}</h1>
    <p class="muted">${esc([l.locality, l.city].filter(Boolean).join(', '))}</p>
    <div class="row" style="gap:6px">
      ${l.media_verified ? `<span class="pill green">${ICON.check}Live camera + GPS se photo</span>` : ''}
      <span class="pill">Update: ${timeAgo(l.last_confirmed_at)}</span>
    </div>
  </div>
  <div class="card section">
    <div class="facts">
      <div class="fact"><span>Type</span><b>${L_ROOM[l.room_type]}</b></div>
      <div class="fact"><span>Security</span><b>${l.deposit ? rupee(l.deposit) : 'Nahi'}</b></div>
      <div class="fact"><span>Furniture</span><b>${L_FURN[l.furnished]}</b></div>
      <div class="fact"><span>Bijli</span><b>${L_ELEC[l.electricity]}</b></div>
      <div class="fact"><span>Pani</span><b>${l.water_included ? 'Shamil' : 'Alag se'}</b></div>
      <div class="fact"><span>Kiske liye</span><b>${L_TEN[l.tenant_pref]}</b></div>
      <div class="fact"><span>Khana</span><b>${L_FOOD[l.food_pref]}</b></div>
    </div>
    ${l.amenities?.length ? `<div class="chips" style="margin-top:12px">${l.amenities.map(a => `<span class="pill grey">${esc(a)}</span>`).join('')}</div>` : ''}
    ${l.description ? `<p style="margin-top:12px">${esc(l.description)}</p>` : ''}
  </div>
  <div class="card section person" style="grid-template-columns:48px 1fr">
    ${avatarHtml(l.landlord)}
    <div><b>${esc(l.landlord?.full_name || 'Makaan malik')}</b><p class="small muted">Makaan malik${avg ? ` · ★ ${avg} (${rts.length} rating)` : ''}</p>
    <span class="pill green" style="margin-top:4px">${ICON.shield}Google verified</span></div>
  </div>
  <div class="section"><div id="r-map" class="map short"></div>
    <p class="small muted" style="margin-top:6px">${unlocked ? 'Exact location' : 'Peela gol = kamra is area mein kahin hai. Exact ghar approve hone ke baad dikhega.'}</p></div>
  <div class="section" id="r-action"></div>`;

  // map
  const exact = priv ? { lat: priv.exact_lat, lng: priv.exact_lng } : null;
  const c = exact || { lat: l.approx_lat, lng: l.approx_lng };
  if (c.lat) {
    const m = makeMap($('#r-map'), c, exact ? 16 : 15);
    if (exact) L.marker([exact.lat, exact.lng], { icon: rentIcon(l.rent) }).addTo(m);
    else L.circle([c.lat, c.lng], { radius: 500, color: '#F5B301', weight: 2, fillOpacity: .2 }).addTo(m);
  }

  // action area
  const A = $('#r-action');
  if (mine) {
    A.innerHTML = `<div class="card stack"><p><b>Yeh aapka kamra hai.</b>${priv?.address ? ' Pata: ' + esc(priv.address) : ''}</p><a class="btn ghost" href="#/my">Mere kamre manage karo</a></div>`;
    return;
  }
  const callBtn = `<button class="btn ghost" id="r-call">${ICON.phone}Internet call (number chhupa)</button>`;
  if (!req || req.status === 'cancelled') {
    A.innerHTML = `<div class="card stack">
      <div class="lock">${ICON.lock}<span>Makaan malik ka number aur ghar ka exact pata tab dikhega jab woh aapki request approve karenge.</span></div>
      <label class="field"><span>Makaan malik ko sandesh</span><textarea id="r-msg" class="input" placeholder="Namaste, main ${esc(S.profile.full_name || '')} hoon. Kya kal shaam kamra dekhne aa sakta hoon?"></textarea></label>
      <button class="btn block" id="r-send">Visit request bhejo</button>
      ${callBtn}
    </div>`;
    $('#r-send').onclick = async () => {
      $('#r-send').disabled = true;
      const msg = $('#r-msg').value.trim() || $('#r-msg').placeholder;
      const { error } = req
        ? await sb.from('requests').update({ status: 'pending', message: msg }).eq('id', req.id)
        : await sb.from('requests').insert({ listing_id: id, tenant_id: uid(), message: msg });
      if (error) { $('#r-send').disabled = false; return toast(error.message, 'bad'); }
      toast('Request bhej di ✅ Makaan malik ko turant notification gaya', 'good');
      render();
    };
  } else if (req.status === 'pending') {
    A.innerHTML = `<div class="card stack">
      <div class="row"><span class="pill genda">Request bheji · ${timeAgo(req.created_at)}</span></div>
      <p>Makaan malik ke jawab ka intezaar hai. Approve hote hi yahin number aur location aa jayegi.</p>
      ${callBtn}
      <button class="btn danger" id="r-cancel">Request cancel karo</button></div>`;
    $('#r-cancel').onclick = async () => { await sb.from('requests').update({ status: 'cancelled' }).eq('id', req.id); render(); };
  } else if (req.status === 'rejected') {
    A.innerHTML = `<div class="card empty"><h3>Makaan malik ne mana kar diya</h3><p>Koi baat nahi — paas mein aur kamre hain.</p><a class="btn" href="#/search">Aur kamre dekho</a></div>`;
  } else {
    const wa = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(`Namaste, KirayaSetu pe aapka kamra "${l.title}" dekha. Main ${S.profile.full_name || ''} hoon.`)}` : '#';
    A.innerHTML = `<div class="unlocked">
      <span class="pill green">${ICON.check}Approved — sab khul gaya</span>
      <div><p class="small muted">Makaan malik ka number</p><p class="phone">${esc(phone ? phone.replace(/(\d{5})(\d{5})/, '$1 $2') : '—')}</p></div>
      ${priv?.address ? `<p><b>Pata:</b> ${esc(priv.address)}</p>` : ''}
      ${exact ? `<a class="btn block" target="_blank" rel="noopener" href="${gmapsDir(exact.lat, exact.lng)}">${ICON.map}Google Maps mein raasta dekho</a>` : ''}
      <div class="row">
        <a class="btn green" href="tel:+91${esc(phone)}">${ICON.phone}Call</a>
        <a class="btn green" target="_blank" rel="noopener" href="${wa}">${ICON.wa}WhatsApp</a>
      </div>
      <a class="btn ghost" href="#/chat/${req.id}">${ICON.chat}App mein chat</a>
    </div>
    <div class="card section stack" id="r-deal"></div>`;
    const D = $('#r-deal');
    if (req.status === 'approved') {
      D.innerHTML = `<p>Kamra dekh aaye?</p><button class="btn ghost" id="r-visited">Haan, kamra dekh liya</button>`;
      $('#r-visited').onclick = async () => { await sb.from('requests').update({ status: 'visited' }).eq('id', req.id); render(); };
    } else if (req.status === 'visited') {
      D.innerHTML = `<p>Kamra pasand aaya aur baat pakki ho gayi?</p><button class="btn genda" id="r-done">Deal pakki ✅</button>${ratingBox(myRating)}`;
      $('#r-done').onclick = async () => { await sb.from('requests').update({ status: 'done' }).eq('id', req.id); toast('Badhai ho! Kamra aapka 🎉', 'good'); render(); };
    } else {
      D.innerHTML = `<p><b>Deal pakki ho gayi 🎉</b> Kamra ab search se hat gaya hai.</p>${ratingBox(myRating)}`;
    }
    bindRating(req, l.landlord_id);
  }
  $('#r-call')?.addEventListener('click', () => startCall(l.landlord_id, l.landlord?.full_name, l.landlord?.avatar_url, l.title));

  // approve hote hi turant refresh
  const ch = sb.channel('room-' + id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests', filter: `tenant_id=eq.${uid()}` }, p => {
    if (p.new.listing_id === id && p.new.status !== req?.status) render();
  }).subscribe();
  S.viewCh.push(ch);
}

const ratingBox = mine => mine ? `<p class="small muted">Aapne rating de di hai — shukriya!</p>` : `
  <div class="stack" style="gap:8px" id="rate"><p><b>Doosron ki madad karo — rating do</b></p>
  <div class="stars">${[1, 2, 3, 4, 5].map(n => `<button data-n="${n}" aria-label="${n} star">★</button>`).join('')}</div>
  <input id="rate-c" class="input" placeholder="Ek line (optional)"><button class="btn" id="rate-go" disabled>Rating bhejo</button></div>`;

function bindRating(req, toUser) {
  if (!$('#rate')) return;
  let n = 0;
  $$('#rate .stars button').forEach(b => b.onclick = () => { n = +b.dataset.n; $$('#rate .stars button').forEach(x => x.classList.toggle('on', +x.dataset.n <= n)); $('#rate-go').disabled = false; });
  $('#rate-go').onclick = async () => {
    const { error } = await sb.from('ratings').insert({ request_id: req.id, from_user: uid(), to_user: toUser, stars: n, comment: $('#rate-c').value.trim() || null });
    if (error) return toast(error.message, 'bad');
    toast('Rating mil gayi, shukriya!', 'good'); render();
  };
}

// =============================================================
//  ADD LISTING (landlord) — voice → AI form → live photos → GPS
// =============================================================
function blankDraft() {
  return {
    lang: store.get('ks_lang', 'hi-IN'), transcript: '', photos: [], video: null, gps: null,
    f: { title: '', rent: '', deposit: '', room_type: 'room', furnished: 'unfurnished', electricity: 'separate', water_included: true, tenant_pref: 'any', food_pref: 'any', amenities: [], locality: '', city: S.profile?.city || '', address: '', description: '' },
  };
}

function viewAdd() {
  const D = S.draft || (S.draft = blankDraft());
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const opt = (obj, v) => Object.entries(obj).map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('');
  const F = D.f;

  app.innerHTML = `
  <h2>Naya kamra daalo</h2>
  <p class="muted" style="margin:4px 0 16px">Kamre pe khade hokar karo — photo aur location wahin se lagegi.</p>

  <div class="card step"><span class="step-n">1</span><div class="stack">
    <div><h3>Bol ke bataiye</h3><p class="small muted">Jaise: "Model Town mein ek kamra hai, kiraya saadhe chaar hazaar, bijli alag, sirf family, attached bathroom"</p></div>
    <select id="a-lang" class="input" aria-label="Bhasha">${LANGS.map(([c, t]) => `<option value="${c}" ${D.lang === c ? 'selected' : ''}>${t}</option>`).join('')}</select>
    ${SR ? `<button id="a-mic" class="mic" aria-label="Bolna shuru karo">${ICON.mic}</button><p id="a-mic-t" class="small muted" style="text-align:center">Mic dabao aur bolo</p>`
      : `<div class="lock">${ICON.mic}<span>Is browser mein bolne ki suvidha nahi hai. Android pe Chrome use karo — ya neeche type kar do.</span></div>`}
    <textarea id="a-tx" class="input" placeholder="Jo bologe woh yahan likha aayega (type bhi kar sakte ho)">${esc(D.transcript)}</textarea>
    <button id="a-ai" class="btn genda">AI se form bharo</button>
  </div></div>

  <div class="card step section"><span class="step-n">2</span><div class="stack">
    <h3>Kamre ki jaankari <span class="small muted">(check kar lo)</span></h3>
    <label class="field"><span>Heading</span><input class="input" data-k="title" value="${esc(F.title)}" placeholder="Jaise: 1 kamra, Model Town"></label>
    <div class="grid2">
      <label class="field"><span>Kiraya (₹/mahina)</span><input class="input" data-k="rent" inputmode="numeric" value="${esc(F.rent)}"></label>
      <label class="field"><span>Security (₹)</span><input class="input" data-k="deposit" inputmode="numeric" value="${esc(F.deposit)}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Type</span><select class="input" data-k="room_type">${opt(L_ROOM, F.room_type)}</select></label>
      <label class="field"><span>Furniture</span><select class="input" data-k="furnished">${opt(L_FURN, F.furnished)}</select></label>
      <label class="field"><span>Bijli</span><select class="input" data-k="electricity">${opt(L_ELEC, F.electricity)}</select></label>
      <label class="field"><span>Pani</span><select class="input" data-k="water_included"><option value="true" ${F.water_included ? 'selected' : ''}>Shamil</option><option value="false" ${!F.water_included ? 'selected' : ''}>Alag se</option></select></label>
      <label class="field"><span>Kiske liye</span><select class="input" data-k="tenant_pref">${opt(L_TEN, F.tenant_pref)}</select></label>
      <label class="field"><span>Khana</span><select class="input" data-k="food_pref">${opt(L_FOOD, F.food_pref)}</select></label>
    </div>
    <div><p class="chip-label">Suvidhayein</p><div class="chips amen">${AMENITIES.map(a => `<button class="chip ${F.amenities.includes(a) ? 'on' : ''}" data-am="${esc(a)}">${esc(a)}</button>`).join('')}</div></div>
    <div class="grid2">
      <label class="field"><span>Mohalla / area</span><input class="input" data-k="locality" value="${esc(F.locality)}"></label>
      <label class="field"><span>Shehar</span><input class="input" data-k="city" value="${esc(F.city)}"></label>
    </div>
    <label class="field"><span>Ghar ka pata</span><input class="input" data-k="address" value="${esc(F.address)}" placeholder="Makaan no., gali"><small>${ICON.lock.replace('<svg', '<svg style="width:13px;height:13px;vertical-align:-2px;fill:none;stroke:currentColor;stroke-width:2"')} Sirf approved kirayedar ko dikhega</small></label>
    <label class="field"><span>Aur kuch</span><textarea class="input" data-k="description">${esc(F.description)}</textarea></label>
  </div></div>

  <div class="card step section" id="a-step3"><span class="step-n">3</span><div class="stack">
    <div><h3>Live photo aur video</h3><p class="small muted">Sirf camera se — kam se kam 2 photo. Har photo pe time aur location chhap jayegi.</p></div>
    <div class="shots" id="a-shots"></div>
  </div></div>

  <div class="card step section" id="a-step4"><span class="step-n">4</span><div class="stack">
    <div><h3>Kamre ki location</h3><p class="small muted">Kamre ke andar ya gate pe khade hokar dabao. Kirayedar ko sirf ~500m ka area dikhega.</p></div>
    <button id="a-gps" class="btn ghost">${ICON.pin}Yahan ki location lock karo</button>
    <p id="a-gps-t" class="small"></p>
    <div id="a-map" class="map short" hidden></div>
  </div></div>

  <button id="a-pub" class="btn block section" style="min-height:56px;font-size:1.1rem">Kamra live karo</button>
  <button id="a-reset" class="btn danger block section">Sab saaf karke naya shuru karo</button>`;

  // ---- sync form → draft
  const syncField = el => {
    const k = el.dataset.k; let v = el.value;
    if (k === 'water_included') v = v === 'true';
    if (k === 'rent' || k === 'deposit') v = v.replace(/\D/g, '');
    F[k] = v;
  };
  $$('[data-k]').forEach(el => el.addEventListener('input', () => syncField(el)));
  $$('[data-am]').forEach(b => b.onclick = () => {
    const a = b.dataset.am; const i = F.amenities.indexOf(a);
    i >= 0 ? F.amenities.splice(i, 1) : F.amenities.push(a); b.classList.toggle('on');
  });
  $('#a-tx').oninput = e => (D.transcript = e.target.value);
  $('#a-lang').onchange = e => { D.lang = e.target.value; store.set('ks_lang', D.lang); };
  $('#a-reset').onclick = () => { if (confirm('Sab bhari hui jaankari aur photo hat jayengi. Pakka?')) { S.draft = null; render(); } };

  // ---- voice
  if (SR) $('#a-mic').onclick = () => toggleListening(SR, D);

  // ---- AI fill
  $('#a-ai').onclick = async () => {
    const text = $('#a-tx').value.trim();
    if (!text) return toast('Pehle bolo ya likho', 'bad');
    stopListening();
    const b = $('#a-ai'); b.disabled = true; b.textContent = 'AI samajh raha hai…';
    const out = await aiFill(text, D.lang);
    b.disabled = false; b.textContent = 'AI se form bharo';
    let n = 0;
    for (const [k, v] of Object.entries(out || {})) {
      if (v === null || v === undefined || v === '' || !(k in F)) continue;
      if (k === 'amenities') { if (Array.isArray(v) && v.length) { F.amenities = [...new Set([...F.amenities, ...v.filter(a => AMENITIES.includes(a))])]; n++; } continue; }
      F[k] = typeof F[k] === 'boolean' ? !!v : String(v); n++;
    }
    render(); // redraw with filled values (draft kept)
    setTimeout(() => { toast(n ? `${n} cheezein bhar di ✅ Ek baar check kar lo` : 'Samajh nahi aaya — thoda saaf bolo ya form khud bharo', n ? 'good' : 'bad'); $('.step.section')?.scrollIntoView({ behavior: 'smooth' }); }, 50);
  };

  // ---- photos
  const drawShots = () => {
    $('#a-shots').innerHTML =
      D.photos.map((p, i) => `<div class="shot"><img src="${p.url}" alt=""><button data-del="${i}" aria-label="Hatao">✕</button></div>`).join('') +
      (D.video ? `<div class="shot"><video src="${D.video.url}" muted playsinline></video><button data-delv aria-label="Video hatao">✕</button></div>` : '') +
      (D.photos.length < 6 ? `<button class="shot-add" id="a-ph">${ICON.cam.replace('<svg', '<svg style="width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:1.8"')}<span>Photo lo</span></button>` : '') +
      (!D.video ? `<button class="shot-add" id="a-vd"><span style="font-size:1.6rem">🎥</span><span>15 sec video</span></button>` : '');
    $$('[data-del]').forEach(b => b.onclick = () => { D.photos.splice(+b.dataset.del, 1); drawShots(); });
    $('[data-delv]')?.addEventListener('click', () => { D.video = null; drawShots(); });
    $('#a-ph')?.addEventListener('click', async () => { const r = await openCamera('photo', D); if (r) { D.photos.push(r); drawShots(); } });
    $('#a-vd')?.addEventListener('click', async () => { const r = await openCamera('video', D); if (r) { D.video = r; drawShots(); } });
    $('#a-step3').classList.toggle('done', D.photos.length >= 2);
  };
  drawShots();

  // ---- GPS
  const showGps = () => {
    if (!D.gps) return;
    $('#a-gps-t').innerHTML = `✅ Location lock ho gayi (±${D.gps.acc} m)${D.gps.acc > 80 ? ' — thoda door ki lag rahi hai, khuli jagah pe dobara dabao' : ''}`;
    $('#a-map').hidden = false;
    const m = makeMap($('#a-map'), D.gps, 17);
    L.marker([D.gps.lat, D.gps.lng], { icon: pinIcon() }).addTo(m);
    L.circle([D.gps.lat, D.gps.lng], { radius: 500, color: '#F5B301', weight: 1, fillOpacity: .1 }).addTo(m);
    $('#a-step4').classList.add('done');
  };
  $('#a-gps').onclick = async () => {
    try { $('#a-gps-t').textContent = 'Location le rahe hain…'; D.gps = await getGPS(true); S.maps.forEach(m => m.remove()); S.maps = []; showGps(); }
    catch (e) { $('#a-gps-t').textContent = e.message; }
  };
  showGps();

  // ---- publish
  $('#a-pub').onclick = () => publishListing(D);
}

let recog = null;
function toggleListening(SR, D) {
  if (recog) return stopListening();
  recog = new SR();
  recog.lang = D.lang; recog.continuous = true; recog.interimResults = true;
  const base = D.transcript ? D.transcript.trim() + ' ' : '';
  let finalTxt = '';
  recog.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalTxt += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    D.transcript = (base + finalTxt).trim();
    const tx = $('#a-tx'); if (tx) tx.value = (base + finalTxt + interim).trim();
  };
  recog.onerror = e => { if (e.error === 'not-allowed') toast('Mic ki permission do (address bar mein 🔒 → Microphone → Allow)', 'bad'); else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Mic error: ' + e.error, 'bad'); };
  recog.onend = () => { recog = null; $('#a-mic')?.classList.remove('live'); const t = $('#a-mic-t'); if (t) t.textContent = 'Mic dabao aur bolo'; };
  try { recog.start(); } catch { recog = null; return; }
  $('#a-mic').classList.add('live'); $('#a-mic-t').textContent = 'Sun raha hoon… bolna band karke mic dobara dabao';
}
function stopListening() { if (recog) { try { recog.stop(); } catch { } recog = null; } }

async function aiFill(text, lang) {
  try {
    const r = await fetch('/api/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  } catch (e) {
    console.warn('AI fallback', e);
    toast('AI abhi nahi mila — simple tareeke se bhara', '');
    return localParse(text);
  }
}

// AI na mile to basic samajh
function localParse(raw) {
  const t = raw.toLowerCase().replace(/[०-९]/g, d => '०१२३४५६७८९'.indexOf(d));
  const out = {};
  const num = t.match(/(?:₹|rs\.?|kiraya|किराया|rent)\D{0,12}(\d[\d,]{2,6})/) || t.match(/(\d[\d,]{3,6})/);
  if (num) out.rent = num[1].replace(/,/g, '');
  const k = t.match(/(\d+(?:\.\d)?)\s*(?:hazaar|hazar|हज़ार|हजार|k\b)/);
  if (!out.rent && k) out.rent = String(Math.round(parseFloat(k[1]) * 1000));
  if (/2\s*bhk|do bhk|दो बीएचके/.test(t)) out.room_type = '2bhk';
  else if (/1\s*bhk|ek bhk|एक बीएचके/.test(t)) out.room_type = '1bhk';
  else if (/1\s*rk|rk\b/.test(t)) out.room_type = '1rk';
  else if (/\bpg\b|पीजी/.test(t)) out.room_type = 'pg';
  if (/family|फैमिली|परिवार|parivar/.test(t)) out.tenant_pref = 'family';
  else if (/bachelor|बैचलर|ladke|लड़के/.test(t)) out.tenant_pref = 'bachelor';
  else if (/ladki|लड़कि|girls/.test(t)) out.tenant_pref = 'girls';
  if (/bijli\s*alag|बिजली\s*अलग|light\s*alag/.test(t)) out.electricity = 'separate';
  if (/veg|शाकाहारी|वेज/.test(t)) out.food_pref = 'veg';
  const am = [];
  if (/attach|अटैच/.test(t)) am.push('Attached bathroom');
  if (/kitchen|रसोई|किचन/.test(t)) am.push('Kitchen');
  if (/parking|पार्किंग/.test(t)) am.push('Parking');
  if (/wifi|वाईफाई/.test(t)) am.push('WiFi');
  if (am.length) out.amenities = am;
  const loc = raw.match(/([A-Za-z\u0900-\u097F0-9]+(?:\s+[A-Za-z\u0900-\u097F0-9]+)?)\s+(?:mein|me|में)(?=[\s,.]|$)/i);
  if (loc) out.locality = loc[1].replace(/^(ek|एक)\s+/i, '');
  out.description = raw.trim().slice(0, 400);
  if (out.room_type || out.rent) out.title = `${L_ROOM[out.room_type || 'room']} kiraye pe`;
  return out;
}

// ---------- live camera ----------
function stopCamStream() { S.camStream?.getTracks().forEach(t => t.stop()); S.camStream = null; }

function openCamera(mode, D) {
  return new Promise(async resolve => {
    const root = $('#overlay-root');
    const done = v => { stopCamStream(); root.innerHTML = ''; resolve(v); };
    let gps = D.gps;
    if (!gps) getGPS().then(g => { gps = g; D.gps = D.gps || g; upd(); }).catch(() => {});
    root.innerHTML = `<div class="overlay">
      <div class="cam-view"><video id="cam-v" autoplay playsinline muted></video><div class="cam-stamp" id="cam-s"></div><div class="cam-rec" id="cam-r" hidden></div></div>
      <div class="cam-bar"><button class="btn ghost" id="cam-x" style="color:#fff;border-color:rgba(255,255,255,.4)">Band karo</button>
      <button class="shutter ${mode === 'video' ? 'rec' : ''}" id="cam-go" aria-label="${mode === 'video' ? 'Record' : 'Photo lo'}"></button><span style="width:96px"></span></div></div>`;
    const stampText = () => `KirayaSetu · ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · ${gps ? gps.lat.toFixed(5) + ', ' + gps.lng.toFixed(5) : 'GPS dhoondh rahe…'}`;
    const upd = () => { const s = $('#cam-s'); if (s) s.textContent = stampText(); };
    upd();
    $('#cam-x').onclick = () => done(null);
    try {
      S.camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: mode === 'video' });
    } catch (e) {
      toast(e.name === 'NotAllowedError' ? 'Camera ki permission do (address bar mein 🔒 → Camera → Allow)' : 'Camera nahi khula: ' + e.message, 'bad');
      return done(null);
    }
    const v = $('#cam-v'); v.srcObject = S.camStream;

    if (mode === 'photo') {
      $('#cam-go').onclick = () => {
        const w = v.videoWidth, h = v.videoHeight; if (!w) return;
        const scale = Math.min(1, 1280 / Math.max(w, h));
        const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        const x = c.getContext('2d'); x.drawImage(v, 0, 0, c.width, c.height);
        const fs = Math.max(14, Math.round(c.width / 45));
        x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, c.height - fs * 2, c.width, fs * 2);
        x.fillStyle = '#F5B301'; x.font = `600 ${fs}px sans-serif`; x.textBaseline = 'middle';
        x.fillText(stampText(), fs * .6, c.height - fs);
        c.toBlob(blob => done({ blob, url: URL.createObjectURL(blob), type: 'image/jpeg', gps }), 'image/jpeg', 0.75);
      };
    } else {
      const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
      const mime = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
      if (!window.MediaRecorder || !mime) { toast('Is phone pe video record nahi ho sakta — photo kaafi hain', 'bad'); return done(null); }
      let rec, chunks = [], timer, left = 15;
      $('#cam-go').onclick = () => {
        if (rec) return rec.stop();
        rec = new MediaRecorder(S.camStream, { mimeType: mime, videoBitsPerSecond: 1_000_000 });
        rec.ondataavailable = e => e.data.size && chunks.push(e.data);
        rec.onstop = () => { clearInterval(timer); const blob = new Blob(chunks, { type: mime.split(';')[0] }); done({ blob, url: URL.createObjectURL(blob), type: mime.split(';')[0], gps }); };
        rec.start(500);
        const r = $('#cam-r'); r.hidden = false; r.textContent = `● ${left}s`;
        timer = setInterval(() => { left--; r.textContent = `● ${left}s`; if (left <= 0) rec.stop(); }, 1000);
      };
    }
  });
}

async function publishListing(D) {
  const F = D.f;
  const miss = [];
  if (!F.title.trim()) miss.push('heading');
  if (!(+F.rent > 0)) miss.push('kiraya');
  if (D.photos.length < 2) miss.push('kam se kam 2 photo');
  if (!D.gps) miss.push('location');
  if (miss.length) return toast('Abhi baaki hai: ' + miss.join(', '), 'bad');

  const root = $('#overlay-root');
  const steps = ['Kamra save', 'Photo upload', 'Location lock', 'Live!'];
  const show = i => (root.innerHTML = `<div class="overlay"><div class="sheet"><h2>Kamra live ho raha hai…</h2><ul class="progress">${steps.map((s, j) => `<li>${j < i ? '✅' : j === i ? '⏳' : '⬜'} ${s}</li>`).join('')}</ul></div></div>`);
  const fail = e => { root.innerHTML = ''; toast('Dikkat: ' + (e.message || e), 'bad'); };
  try {
    show(0);
    const { data: l, error } = await sb.from('listings').insert({
      landlord_id: uid(), title: F.title.trim(), rent: +F.rent, deposit: +F.deposit || 0,
      room_type: F.room_type, furnished: F.furnished, electricity: F.electricity, water_included: F.water_included,
      tenant_pref: F.tenant_pref, food_pref: F.food_pref, amenities: F.amenities, locality: F.locality.trim(), city: F.city.trim(),
      description: F.description.trim() || null, media_verified: true,
    }).select().single();
    if (error) throw error;

    show(1);
    const up = async (blob, name, type) => {
      const path = `${uid()}/${l.id}/${name}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
      if (error) throw error;
      return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    };
    const photos = [];
    for (let i = 0; i < D.photos.length; i++) photos.push(await up(D.photos[i].blob, `p${i}-${Date.now()}.jpg`, 'image/jpeg'));
    const video_url = D.video ? await up(D.video.blob, `v-${Date.now()}.${D.video.type.includes('mp4') ? 'mp4' : 'webm'}`, D.video.type) : null;
    const u = await sb.from('listings').update({ photos, video_url }).eq('id', l.id);
    if (u.error) throw u.error;

    show(2);
    const p = await sb.from('listing_private').insert({ listing_id: l.id, exact_lat: D.gps.lat, exact_lng: D.gps.lng, address: F.address.trim() || null });
    if (p.error) throw p.error;

    show(4);
    setTimeout(() => { root.innerHTML = ''; S.draft = null; toast('Kamra live ho gaya ✅ Ab paas ke log dekh sakte hain', 'good'); go('room/' + l.id); }, 700);
  } catch (e) { fail(e); }
}

// =============================================================
//  MY LISTINGS (landlord)
// =============================================================
async function viewMy() {
  app.innerHTML = '<div class="boot">…</div>';
  const [{ data: ls, error }, { data: reqs }] = await Promise.all([
    sb.from('listings').select('*').eq('landlord_id', uid()).order('created_at', { ascending: false }),
    sb.from('requests').select('listing_id,status').eq('landlord_id', uid()).eq('status', 'pending'),
  ]);
  if (error) throw error;
  const pend = {}; (reqs || []).forEach(r => (pend[r.listing_id] = (pend[r.listing_id] || 0) + 1));

  app.innerHTML = `
  <div class="row" style="justify-content:space-between;margin-bottom:14px"><h2>Mere kamre</h2><a class="btn sm" href="#/add">+ Naya kamra</a></div>
  <div class="list">${ls.length ? ls.map(l => {
    const d = daysSince(l.last_confirmed_at);
    const hiddenByAge = l.status === 'live' && d >= 7;
    return `<div class="card stack" style="gap:10px">
      <a class="room-card" style="padding:0" href="#/room/${l.id}">
        <div class="thumb">${l.photos?.[0] ? `<img src="${esc(l.photos[0])}" alt="">` : ''}</div>
        <div class="body"><span class="tag">${rupee(l.rent)}</span><h3>${esc(l.title)}</h3>
          <div class="row" style="gap:6px">
            <span class="pill ${l.status === 'live' && !hiddenByAge ? 'green' : l.status === 'rented' ? '' : 'grey'}">${l.status === 'rented' ? 'Kiraye pe chala gaya' : l.status === 'hidden' ? 'Chhupa hua' : hiddenByAge ? 'Search se chhupa' : 'Live'}</span>
            ${pend[l.id] ? `<span class="pill red">${pend[l.id]} nayi request</span>` : ''}
          </div></div></a>
      ${l.status === 'live' ? `<div class="lock" style="${d >= 5 ? '' : 'background:var(--paper)'}">${ICON.check}<span>${hiddenByAge ? '<b>7 din se confirm nahi kiya — kirayedaron ko nahi dikh raha.</b>' : `Pichhli baar confirm: ${d === 0 ? 'aaj' : d + ' din pehle'}. ${d >= 5 ? 'Jaldi confirm karo warna search se chhup jayega.' : 'Har 7 din mein confirm karna hota hai.'}`}</span></div>
        <button class="btn genda" data-conf="${l.id}">Haan, abhi bhi khaali hai</button>` : ''}
      <div class="row">
        ${l.status === 'live' ? `<button class="btn ghost sm" data-st="${l.id}:rented">Kiraye pe de diya</button><button class="btn ghost sm" data-st="${l.id}:hidden">Chhupao</button>`
        : `<button class="btn ghost sm" data-st="${l.id}:live">Dobara live karo</button>`}
        <button class="btn danger sm" data-del="${l.id}">Hatao</button>
      </div></div>`;
  }).join('') : `<div class="empty card"><h3>Abhi koi kamra nahi</h3><p>Kamre pe khade hokar 2 minute mein daal do — bol ke.</p><a class="btn" href="#/add">Pehla kamra daalo</a></div>`}</div>`;

  $$('[data-conf]').forEach(b => b.onclick = async () => {
    const { error } = await sb.from('listings').update({ last_confirmed_at: new Date().toISOString(), status: 'live' }).eq('id', b.dataset.conf);
    if (error) return toast(error.message, 'bad'); toast('Confirm ho gaya ✅ Agle 7 din dikhega', 'good'); render();
  });
  $$('[data-st]').forEach(b => b.onclick = async () => {
    const [id, st] = b.dataset.st.split(':');
    const patch = { status: st }; if (st === 'live') patch.last_confirmed_at = new Date().toISOString();
    const { error } = await sb.from('listings').update(patch).eq('id', id);
    if (error) return toast(error.message, 'bad'); render();
  });
  $$('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Yeh kamra hamesha ke liye hat jayega. Pakka?')) return;
    const { error } = await sb.from('listings').delete().eq('id', b.dataset.del);
    if (error) return toast(error.message, 'bad'); toast('Hata diya'); render();
  });
}

// =============================================================
//  REQUESTS
// =============================================================
const REQ_SEL = '*, listing:listings(id,title,rent,photos), tenant:profiles!requests_tenant_id_fkey(id,full_name,avatar_url), landlord:profiles!requests_landlord_id_fkey(id,full_name,avatar_url)';

async function viewRequests() {
  const tab = S.reqTab || (S.profile.role === 'landlord' ? 'in' : 'out');
  app.innerHTML = `<h2 style="margin-bottom:12px">Requests</h2>
  <div class="tabs"><button data-t="in" class="${tab === 'in' ? 'on' : ''}">Aayi hui</button><button data-t="out" class="${tab === 'out' ? 'on' : ''}">Maine bheji</button></div>
  <div id="rq" class="list"><div class="boot">…</div></div>`;
  $$('.tabs button').forEach(b => b.onclick = () => { S.reqTab = b.dataset.t; render(); });

  const col = tab === 'in' ? 'landlord_id' : 'tenant_id';
  const { data, error } = await sb.from('requests').select(REQ_SEL).eq(col, uid()).neq('status', 'cancelled').order('updated_at', { ascending: false });
  if (error) throw error;
  const box = $('#rq');
  if (!data.length) {
    box.innerHTML = tab === 'in'
      ? `<div class="empty card"><h3>Abhi koi request nahi</h3><p>Jab koi aapke kamre ke liye request bhejega, yahan turant dikhega.</p></div>`
      : `<div class="empty card"><h3>Aapne abhi koi request nahi bheji</h3><a class="btn" href="#/search">Kamre dhoondho</a></div>`;
    return;
  }
  box.innerHTML = data.map(r => {
    const other = tab === 'in' ? r.tenant : r.landlord;
    const open = ['approved', 'visited', 'done'].includes(r.status);
    return `<div class="card req">
      <div class="req-top" style="grid-template-columns:48px 1fr">${avatarHtml(other)}<div><b>${esc(other?.full_name || '')}</b>
        <p class="small muted">${tab === 'in' ? 'Kirayedar · Google verified' : 'Makaan malik'} · ${timeAgo(r.created_at)}</p></div></div>
      <div class="row" style="justify-content:space-between"><span class="pill ${STATUS_PILL[r.status]}">${L_STATUS[r.status]}</span>
      <a href="#/room/${r.listing_id}" class="small">${esc(r.listing?.title || 'Kamra')} ${r.listing ? '· ' + rupee(r.listing.rent) : ''}</a></div>
      ${r.message ? `<p class="req-msg">${esc(r.message)}</p>` : ''}
      <div class="row">
        ${tab === 'in' && r.status === 'pending' ? `<button class="btn green" data-ap="${r.id}">Approve — number aur location do</button><button class="btn danger" data-rj="${r.id}">Mana karo</button>` : ''}
        ${open ? `<a class="btn ghost" href="#/chat/${r.id}">${ICON.chat}Chat</a>` : ''}
        ${(tab === 'in' && r.status !== 'rejected') || (tab === 'out' && r.status === 'pending') ? `<button class="btn ghost" data-call="${other?.id}" data-name="${esc(other?.full_name || '')}" data-av="${esc(other?.avatar_url || '')}" data-t="${esc(r.listing?.title || '')}">${ICON.phone}Internet call</button>` : ''}
      </div></div>`;
  }).join('');

  const setSt = async (id, st, msg) => { const { error } = await sb.from('requests').update({ status: st }).eq('id', id); if (error) return toast(error.message, 'bad'); toast(msg, 'good'); render(); };
  $$('[data-ap]').forEach(b => b.onclick = () => setSt(b.dataset.ap, 'approved', 'Approve kar diya ✅ Kirayedar ko aapka number aur location mil gayi'));
  $$('[data-rj]').forEach(b => b.onclick = () => setSt(b.dataset.rj, 'rejected', 'Mana kar diya'));
  $$('[data-call]').forEach(b => b.onclick = () => startCall(b.dataset.call, b.dataset.name, b.dataset.av, b.dataset.t));
}

// =============================================================
//  CHAT
// =============================================================
async function viewChat(rid) {
  const { data: r, error } = await sb.from('requests').select(REQ_SEL).eq('id', rid).maybeSingle();
  if (error) throw error;
  if (!r) { app.innerHTML = `<div class="empty"><h3>Chat nahi mili</h3></div>`; return; }
  const other = r.tenant_id === uid() ? r.landlord : r.tenant;
  app.innerHTML = `<div class="chat">
    <div class="chat-head">${avatarHtml(other)}<div><b>${esc(other?.full_name)}</b><p class="small muted">${esc(r.listing?.title || '')}</p></div>
      <button class="btn ghost sm" id="c-call" aria-label="Internet call">${ICON.phone}</button></div>
    <div class="msgs" id="msgs"></div>
    <form class="chat-form" id="c-form"><input id="c-in" class="input" placeholder="Sandesh likho…" autocomplete="off" enterkeyhint="send"><button class="btn">Bhejo</button></form></div>`;
  const box = $('#msgs');
  const seen = new Set();
  const add = m => {
    if (seen.has(m.id)) return; seen.add(m.id);
    box.insertAdjacentHTML('beforeend', `<div class="msg ${m.sender_id === uid() ? 'me' : ''}">${esc(m.body)}<time>${clock(m.created_at)}</time></div>`);
    box.scrollTop = box.scrollHeight;
  };
  const { data: msgs } = await sb.from('messages').select('*').eq('request_id', rid).order('created_at');
  (msgs || []).forEach(add);
  if (!msgs?.length) box.innerHTML = `<p class="small muted" style="text-align:center">Baat shuru karo — number share kiye bina.</p>`;
  const ch = sb.channel('chat-' + rid).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `request_id=eq.${rid}` }, p => add(p.new)).subscribe();
  S.viewCh.push(ch);
  $('#c-form').onsubmit = async e => {
    e.preventDefault();
    const body = $('#c-in').value.trim(); if (!body) return;
    $('#c-in').value = '';
    const { data, error } = await sb.from('messages').insert({ request_id: rid, sender_id: uid(), body }).select().single();
    if (error) return toast(error.message, 'bad');
    add(data);
  };
  $('#c-call').onclick = () => startCall(other.id, other.full_name, other.avatar_url, r.listing?.title);
}

// =============================================================
//  PROFILE
// =============================================================
function viewProfile() {
  const p = S.profile;
  app.innerHTML = `<div class="stack">
    <div class="person" style="grid-template-columns:48px 1fr">${avatarHtml(p)}<div><h2>${esc(p.full_name)}</h2><p class="small muted">${esc(S.session.user.email)} · Google verified</p></div></div>
    <div class="card stack">
      <div class="field"><span>Main abhi</span><div class="roles">
        <button class="role ${p.role === 'tenant' ? 'on' : ''}" data-role="tenant"><b>Kamra dhoondh raha</b></button>
        <button class="role ${p.role === 'landlord' ? 'on' : ''}" data-role="landlord"><b>Kamra de raha</b></button></div></div>
      <label class="field"><span>Naam</span><input id="p-name" class="input" value="${esc(p.full_name)}"></label>
      <label class="field"><span>Mobile</span><input id="p-phone" class="input" inputmode="numeric" maxlength="10" value="${esc(S.phone)}"><small>Sirf approved logon ko dikhta hai</small></label>
      <label class="field"><span>Shehar</span><input id="p-city" class="input" value="${esc(p.city)}"></label>
      <button id="p-save" class="btn">Save karo</button>
    </div>
    ${S.installEvt ? `<button id="p-install" class="btn genda">📲 Phone pe app install karo</button>` : `<p class="small muted">App jaisa chalane ke liye: Chrome menu (⋮) → "Add to Home screen".</p>`}
    <p class="small muted">Internet call ke liye yeh app khula rehna chahiye — upar hara dot = aap call le sakte ho.</p>
    <a class="btn ghost" href="/privacy.html">Privacy niyam</a>
    <button id="p-out" class="btn danger">Logout</button></div>`;
  let role = p.role;
  $$('.role').forEach(b => b.onclick = () => { role = b.dataset.role; $$('.role').forEach(x => x.classList.toggle('on', x === b)); });
  $('#p-save').onclick = async () => {
    const phone = $('#p-phone').value.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(phone)) return toast('Sahi 10 digit number daalo', 'bad');
    const patch = { full_name: $('#p-name').value.trim(), city: $('#p-city').value.trim(), role };
    const a = await sb.from('profiles').update(patch).eq('id', uid());
    const b = await sb.from('profile_private').upsert({ id: uid(), phone });
    if (a.error || b.error) return toast((a.error || b.error).message, 'bad');
    Object.assign(S.profile, patch); S.phone = phone; toast('Save ho gaya ✅', 'good');
  };
  $('#p-install')?.addEventListener('click', async () => { S.installEvt.prompt(); S.installEvt = null; });
  $('#p-out').onclick = async () => { await sb.auth.signOut(); };
}

// =============================================================
//  REALTIME: requests badge + toasts
// =============================================================
async function refreshBadge() {
  if (!uid()) return;
  const { count } = await sb.from('requests').select('id', { count: 'exact', head: true }).eq('landlord_id', uid()).eq('status', 'pending');
  const b = $('#badge'); b.hidden = !count; b.textContent = count || '';
}

function subscribeGlobal() {
  if (S.globalCh) sb.removeChannel(S.globalCh);
  const id = uid();
  const onChange = (p, side) => {
    refreshBadge();
    if (side === 'landlord' && p.eventType === 'INSERT') { toast('🔔 Nayi visit request aayi!', 'good'); navigator.vibrate?.(200); }
    if (side === 'landlord' && p.eventType === 'UPDATE' && p.new.status === 'pending') { toast('🔔 Ek request dobara aayi', 'good'); }
    if (side === 'tenant' && p.eventType === 'UPDATE' && p.new.status === 'approved') { toast('🎉 Request approve! Number aur location khul gaye', 'good'); navigator.vibrate?.([100, 60, 100]); }
    const path = location.hash.replace(/^#\/?/, '');
    if (path === 'requests' || path === 'my') render();
  };
  S.globalCh = sb.channel('me-' + id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: `landlord_id=eq.${id}` }, p => onChange(p, 'landlord'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: `tenant_id=eq.${id}` }, p => onChange(p, 'tenant'))
    .subscribe();
}

// =============================================================
//  INTERNET CALL (WebRTC via PeerJS) — number kabhi share nahi hota
// =============================================================
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] };

function startPeer() {
  if (!window.Peer || S.peer) return;
  try {
    S.peer = new Peer('ks-' + uid(), { config: ICE, debug: 0 });
    S.peer.on('open', () => $('#online-dot').classList.add('on'));
    S.peer.on('disconnected', () => { $('#online-dot').classList.remove('on'); setTimeout(() => S.peer && !S.peer.destroyed && S.peer.reconnect(), 3000); });
    S.peer.on('error', e => {
      if (e.type === 'peer-unavailable') { endCall(); toast('Woh abhi app pe online nahi hain. Visit request ya chat bhej do.', 'bad'); }
      else if (e.type === 'unavailable-id') { /* doosre tab mein khula hai */ }
      else console.warn('peer', e.type);
    });
    S.peer.on('call', incomingCall);
  } catch (e) { console.warn(e); }
}

function callSheet(name, av, title, status, buttons) {
  $('#overlay-root').innerHTML = `<div class="overlay"><div class="sheet">
    ${av ? `<img class="call-avatar" src="${esc(av)}" referrerpolicy="no-referrer" alt="">` : `<div class="call-avatar">${initial(name)}</div>`}
    <h2>${esc(name || 'KirayaSetu user')}</h2>${title ? `<p class="small muted">${esc(title)}</p>` : ''}
    <p class="call-status" id="call-st">${status}</p><p class="small muted">${ICON.lock.replace('<svg', '<svg style="width:13px;height:13px;vertical-align:-2px;fill:none;stroke:currentColor;stroke-width:2"')} Dono ke number chhupe hain</p>
    <div class="row">${buttons}</div><audio id="call-audio" autoplay playsinline></audio></div></div>`;
}

async function getMic() {
  try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }); }
  catch { toast('Mic ki permission do (address bar mein 🔒 → Microphone → Allow)', 'bad'); return null; }
}

function wireCall(call) {
  S.call = call;
  let secs = 0, t;
  call.on('stream', remote => {
    const a = $('#call-audio'); if (a) { a.srcObject = remote; a.play?.().catch(() => {}); }
    clearInterval(t); t = setInterval(() => { secs++; const st = $('#call-st'); if (st) st.textContent = `Baat ho rahi hai · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`; }, 1000);
  });
  call.on('close', () => { clearInterval(t); endCall(); });
  call.on('error', () => { clearInterval(t); endCall(); });
  const pc = call.peerConnection;
  if (pc) pc.addEventListener('iceconnectionstatechange', () => {
    if (pc.iceConnectionState === 'failed') { toast('Call connect nahi hui — network ki dikkat. Chat use karo.', 'bad'); endCall(); }
    if (pc.iceConnectionState === 'disconnected') setTimeout(() => pc.iceConnectionState === 'disconnected' && endCall(), 4000);
  });
}

async function startCall(toId, name, av, title) {
  if (!S.peer || S.peer.disconnected) return toast('Call server se connect ho rahe hain, 2 second baad try karo', 'bad');
  if (!toId || toId === uid()) return;
  callSheet(name, av, title, 'Ring ho raha hai…', `<button class="btn danger block" id="call-end">Kaato</button>`);
  $('#call-end').onclick = endCall;
  const mic = await getMic(); if (!mic) return endCall();
  S.callStream = mic;
  const call = S.peer.call('ks-' + toId, mic, { metadata: { name: S.profile.full_name, av: S.profile.avatar_url, title } });
  if (!call) return endCall();
  wireCall(call);
  setTimeout(() => { if (S.call === call && $('#call-st')?.textContent.startsWith('Ring')) { toast('Jawab nahi mila. Request ya chat bhej do.', 'bad'); endCall(); } }, 35000);
}

function incomingCall(call) {
  if (S.call) { call.close(); return; }
  const m = call.metadata || {};
  navigator.vibrate?.([300, 200, 300, 200, 300]);
  callSheet(m.name, m.av, m.title, '📞 Internet call aa rahi hai…', `<button class="btn danger" id="call-no">Kaato</button><button class="btn green" id="call-yes">Uthao</button>`);
  S.call = call;
  call.on('close', endCall);
  $('#call-no').onclick = () => { call.close(); endCall(); };
  $('#call-yes').onclick = async () => {
    const mic = await getMic(); if (!mic) { call.close(); return endCall(); }
    S.callStream = mic;
    $('.sheet .row').innerHTML = `<button class="btn danger block" id="call-end">Kaato</button>`;
    $('#call-end').onclick = endCall;
    $('#call-st').textContent = 'Jud raha hai…';
    wireCall(call);
    call.answer(mic);
  };
}

function endCall() {
  const c = S.call; S.call = null;
  try { c?.close(); } catch { }
  S.callStream?.getTracks().forEach(t => t.stop()); S.callStream = null;
  if ($('#call-st')) $('#overlay-root').innerHTML = '';
}

boot().catch(e => { console.error(e); app.innerHTML = errorBox(e); });
