// AmarElaka — frontend logic
(function () {
  'use strict';
  const { api, Auth, photoUrl } = window.AE;
  const CFG = window.AMARELAKA_CONFIG || {};

  const CATS = { pothole: 'রাস্তার গর্ত', light: 'নষ্ট স্ট্রিটলাইট', garbage: 'ময়লা-আবর্জনা', water: 'পানি জমা', drain: 'ড্রেন / নালা', other: 'অন্যান্য' };
  const ST = {
    new: ['জমা হয়েছে', '#6b7280'], verified: ['যাচাই হয়েছে', '#2563eb'], progress: ['কাজ চলছে', '#d97706'],
    resolved: ['সমাধান হয়েছে', '#16a34a'], rejected: ['বাতিল', '#b91c1c'], merged: ['একত্রিত', '#64748b'],
  };
  const FLOW = ['new', 'verified', 'progress', 'resolved'];
  const SEV = { normal: 'সাধারণ', medium: 'মাঝারি', high: 'গুরুত্বপূর্ণ', urgent: 'জরুরি' };

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bn = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
  const date = (d) => { try { return new Date(d).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
  const ago = (d) => {
    const m = Math.max(0, (Date.now() - new Date(d).getTime()) / 60000);
    if (m < 60) return bn(Math.round(m)) + ' মিনিট আগে';
    if (m < 1440) return bn(Math.round(m / 60)) + ' ঘণ্টা আগে';
    return bn(Math.round(m / 1440)) + ' দিন আগে';
  };
  const isOpen = (s) => ['new', 'verified', 'progress'].includes(s);
  const catKey = (c) => (CATS[c] ? c : 'other');
  const stOf = (s) => ST[s] || ST.new;
  function toast(t) {
    const e = $('#toast'); e.textContent = t; e.style.display = 'block';
    clearTimeout(toast.t); toast.t = setTimeout(() => { e.style.display = 'none'; }, 3500);
  }
  function banner(t) { const b = $('#banner'); b.textContent = t || ''; b.style.display = t ? 'block' : 'none'; }

  // ---------- state ----------
  let reports = [];
  let catF = 'all';
  let homeMap, homeLayer, pickMap, pickMarker, pickLayer;
  let pick = null, selCat = null, photoBlob = null, photoPreview = null;
  let openId = null;

  // ---------- rendering pieces ----------
  const pill = (s) => { const [t, c] = stOf(s); return `<span class="pill" style="background:${c}">${t}</span>`; };
  const thumb = (r) => r.photo
    ? `<img class="thumb" src="${esc(photoUrl(r.photo))}" alt="" loading="lazy">`
    : `<span class="thumb"><svg><use href="#ic-${catKey(r.category)}"/></svg></span>`;
  const progPct = (s) => { const i = FLOW.indexOf(s); return i < 0 ? 100 : (i + 1) * 25; };
  function item(r) {
    return `<button class="item" data-open="${esc(r.id)}">${thumb(r)}<span>
      <span class="meta">${pill(r.status)}<span>${esc(CATS[r.category] || '')}</span>${r.isMine ? '<span class="tag">আমার</span>' : ''}</span>
      <h3>${esc(r.title)}</h3>
      <span class="meta"><span>${esc(r.area)}</span><span>${ago(r.createdAt)}</span>${r.weight > 1 ? `<span>${bn(r.weight)} জন জানিয়েছেন</span>` : ''}</span>
      <span class="prog"><i style="width:${progPct(r.status)}%;background:${stOf(r.status)[1]}"></i></span></span></button>`;
  }

  // ---------- header / auth ----------
  function renderAuth() {
    const u = Auth.user;
    $('#navLogin').hidden = !!u;
    $('#logoutBtn').hidden = !u;
    $('#navUser').hidden = !u;
    $('#navUser').textContent = u ? u.name : '';
    $('#navAdmin').hidden = !(u && u.role === 'admin');
  }
  $('#logoutBtn').addEventListener('click', () => { Auth.clear(); renderAuth(); toast('লগআউট হয়েছে।'); location.hash = '#map'; loadReports(); });
  window.addEventListener('ae:logout', () => { renderAuth(); toast('আবার লগইন করুন।'); });

  let afterLogin = 'map';
  function requireLogin(view) {
    if (Auth.user) return true;
    afterLogin = view;
    location.hash = '#login';
    toast('এই কাজের জন্য আগে লগইন করুন।');
    return false;
  }

  // Sign-in finished: save the login and go on
  function signedIn(d) {
    Auth.save(d.token, d.user); renderAuth();
    toast('স্বাগতম, ' + d.user.name + '!');
    location.hash = '#' + (d.user.role === 'admin' && afterLogin === 'map' ? 'admin' : afterLogin);
    loadReports();
  }

  // The server emailed a 6-digit code: show the code page
  let pendingEmail = null;
  function askCode(d) {
    pendingEmail = d.email;
    try { sessionStorage.setItem('ae_pending', d.email); } catch { /* ignore */ }
    $('#v-msg').textContent = d.message || 'আপনার ইমেইলে ৬ অঙ্কের একটি কোড পাঠানো হয়েছে।';
    $('#v-code').value = ''; $('#v-err').textContent = '';
    startResendTimer();
    location.hash = '#verify';
    setTimeout(() => $('#v-code').focus(), 100);
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#l-err').textContent = '';
    const btn = e.submitter || $('#loginForm button[type=submit]'); btn.disabled = true;
    try {
      const d = await api('/api/auth/login', { method: 'POST', body: { email: $('#l-email').value, password: $('#l-pass').value } });
      $('#loginForm').reset();
      if (d.needCode) askCode(d); else signedIn(d);
    } catch (err) { $('#l-err').textContent = err.message; }
    btn.disabled = false;
  });
  $('#regForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#r-err').textContent = '';
    const btn = e.submitter || $('#regForm button[type=submit]'); btn.disabled = true;
    try {
      const d = await api('/api/auth/register', { method: 'POST', body: {
        name: $('#r-name').value, email: $('#r-email').value, phone: $('#r-phone').value, password: $('#r-pass').value,
      } });
      $('#regForm').reset();
      if (d.needCode) askCode(d); else signedIn(d);
    } catch (err) { $('#r-err').textContent = err.message; }
    btn.disabled = false;
  });
  $('#verifyForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#v-err').textContent = '';
    const code = $('#v-code').value.replace(/\D/g, '');
    if (code.length !== 6) { $('#v-err').textContent = '৬ অঙ্কের কোডটি লিখুন।'; return; }
    try {
      const d = await api('/api/auth/verify', { method: 'POST', body: { email: pendingEmail, code } });
      try { sessionStorage.removeItem('ae_pending'); } catch { /* ignore */ }
      pendingEmail = null;
      signedIn(d);
    } catch (err) { $('#v-err').textContent = err.message; }
  });
  $('#v-code').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (e.target.value.length === 6) $('#verifyForm').requestSubmit();
  });
  let resendTimer = null;
  function startResendTimer(sec = 60, sel = '#resendBtn') {
    const b = $(sel); clearInterval(resendTimer);
    let left = sec; b.disabled = true;
    const tick = () => {
      if (left <= 0) { clearInterval(resendTimer); b.disabled = false; b.textContent = 'আবার কোড পাঠান'; return; }
      b.textContent = `আবার কোড পাঠান (${bn(left)})`; left -= 1;
    };
    tick(); resendTimer = setInterval(tick, 1000);
  }
  // ----- forgot password -----
  let resetEmail = null;
  async function sendResetCode() {
    const d = await api('/api/auth/forgot', { method: 'POST', body: { email: resetEmail } });
    $('#rs-msg').textContent = d.message + ' (' + resetEmail + ')';
    startResendTimer(60, '#rsResend');
  }
  $('#forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#f-err').textContent = '';
    resetEmail = $('#f-email').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) { $('#f-err').textContent = 'সঠিক ইমেইল দিন।'; return; }
    const btn = e.submitter || $('#forgotForm button[type=submit]'); btn.disabled = true;
    try {
      await sendResetCode();
      $('#forgotForm').hidden = true; $('#resetForm').hidden = false;
      $('#rs-err').textContent = ''; setTimeout(() => $('#rs-code').focus(), 100);
    } catch (err) { $('#f-err').textContent = err.message; }
    btn.disabled = false;
  });
  $('#rs-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
  $('#resetForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#rs-err').textContent = '';
    const code = $('#rs-code').value, p1 = $('#rs-pass').value, p2 = $('#rs-pass2').value;
    if (code.length !== 6) { $('#rs-err').textContent = '৬ অঙ্কের কোডটি লিখুন।'; return; }
    if (p1.length < 6) { $('#rs-err').textContent = 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'; return; }
    if (p1 !== p2) { $('#rs-err').textContent = 'দুটি পাসওয়ার্ড মিলছে না।'; return; }
    try {
      const d = await api('/api/auth/reset', { method: 'POST', body: { email: resetEmail, code, password: p1 } });
      $('#resetForm').reset(); $('#forgotForm').reset();
      $('#resetForm').hidden = true; $('#forgotForm').hidden = false;
      toast('পাসওয়ার্ড বদলানো হয়েছে।');
      signedIn(d);
    } catch (err) { $('#rs-err').textContent = err.message; }
  });
  $('#rsResend').addEventListener('click', async () => {
    $('#rs-err').textContent = '';
    try { await sendResetCode(); toast('নতুন কোড পাঠানো হয়েছে।'); } catch (err) { $('#rs-err').textContent = err.message; }
  });

  $('#resendBtn').addEventListener('click', async () => {
    $('#v-err').textContent = '';
    try { const d = await api('/api/auth/resend', { method: 'POST', body: { email: pendingEmail } }); toast(d.message); startResendTimer(); }
    catch (err) { $('#v-err').textContent = err.message; }
  });

  // ---------- maps ----------
  function makeMap(el) {
    const m = L.map(el, { scrollWheelZoom: false }).setView(CFG.MAP_CENTER || [23.46, 90.64], CFG.MAP_ZOOM || 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    return m;
  }
  function circleFor(r) {
    return L.circleMarker([r.lat, r.lng], {
      radius: 8 + Math.min(r.weight || 1, 8) * 2,
      color: '#ffffff', weight: 2, fillColor: stOf(r.status)[1], fillOpacity: 0.9,
    });
  }

  function renderHome() {
    const done = $('#showDone').checked;
    let L1 = reports.filter((r) => (done || r.status !== 'resolved') && (catF === 'all' || r.category === catF));
    if (homeLayer) {
      homeLayer.clearLayers();
      L1.forEach((r) => {
        const c = circleFor(r).addTo(homeLayer);
        // Tooltip built as a DOM node so the title is shown as plain text, never HTML
        const tip = document.createElement('span'); tip.textContent = r.title + ' — ' + stOf(r.status)[0];
        c.bindTooltip(tip);
        c.on('click', () => openDetail(r.id));
      });
    }
    L1 = [...L1].sort($('#sortHome').value === 'sev'
      ? (a, b) => b.weight - a.weight || new Date(b.createdAt) - new Date(a.createdAt)
      : (a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    $('#homeList').innerHTML = L1.length ? L1.map(item).join('') : '<div class="empty">এই ফিল্টারে কোনো রিপোর্ট নেই। প্রথম সমস্যাটি আপনিই জানান!</div>';
  }
  function renderStats() {
    const c = (k) => reports.filter((r) => k.includes(r.status)).length;
    $('#stats').innerHTML = [[reports.length, 'মোট রিপোর্ট'], [c(['new', 'verified']), 'অপেক্ষমাণ'], [c(['progress']), 'কাজ চলছে'], [c(['resolved']), 'সমাধান হয়েছে']]
      .map(([n, t]) => `<div class="stat"><b>${bn(n)}</b><span>${t}</span></div>`).join('');
  }
  function renderPickLayer() {
    if (!pickLayer) return;
    pickLayer.clearLayers();
    reports.filter((r) => isOpen(r.status)).forEach((r) => circleFor(r).setStyle({ fillOpacity: 0.45 }).addTo(pickLayer));
  }

  async function loadReports() {
    try {
      const d = await api('/api/reports');
      reports = d.reports || [];
      banner('');
    } catch (err) {
      banner(err.message + ' (ফ্রি সার্ভার ঘুমিয়ে থাকলে প্রথমবার চালু হতে প্রায় এক মিনিট লাগতে পারে।)');
    }
    renderStats(); renderHome(); renderPickLayer();
    if (location.hash === '#track') loadMine();
  }

  // ---------- home filters ----------
  $('#catFilter').innerHTML = [['all', 'সব']].concat(Object.entries(CATS))
    .map(([k, t]) => `<button type="button" class="chip" data-c="${k}" aria-pressed="${k === 'all'}">${k === 'all' ? '' : `<svg><use href="#ic-${k}"/></svg>`}${t}</button>`).join('');
  $('#catFilter').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    catF = b.dataset.c;
    $('#catFilter').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderHome();
  });
  $('#legend').innerHTML = Object.entries(ST).filter(([k]) => !['merged', 'rejected'].includes(k))
    .map(([, v]) => `<span><i style="background:${v[1]}"></i>${v[0]}</span>`).join('');
  $('#showDone').addEventListener('change', renderHome);
  $('#sortHome').addEventListener('change', renderHome);

  // ---------- report form ----------
  $('#catPick').innerHTML = Object.entries(CATS)
    .map(([k, t]) => `<label><input type="radio" name="cat" value="${k}"><svg><use href="#ic-${k}"/></svg>${t}</label>`).join('');
  $('#catPick').addEventListener('change', (e) => { selCat = e.target.value; $('#e-cat').textContent = ''; checkDup(); });

  const pinIcon = L.divIcon({
    className: 'pick-pin', iconSize: [32, 42], iconAnchor: [16, 42],
    html: '<svg width="32" height="42" viewBox="-17 -48 34 50"><path d="M0 0C-4-10-16-18-16-30a16 16 0 0 1 32 0C16-18 4-10 0 0z" fill="#f5b800" stroke="#163a6b" stroke-width="3"/><circle cy="-30" r="6" fill="#163a6b"/></svg>',
  });
  function setPick(lat, lng, zoom) {
    pick = { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
    if (!pickMarker) {
      pickMarker = L.marker([pick.lat, pick.lng], { draggable: true, icon: pinIcon }).addTo(pickMap);
      pickMarker.on('dragend', () => { const ll = pickMarker.getLatLng(); setPick(ll.lat, ll.lng, false); });
    }
    else pickMarker.setLatLng([pick.lat, pick.lng]);
    if (zoom) pickMap.setView([pick.lat, pick.lng], 17);
    $('#locTxt').textContent = 'লোকেশন বেছে নেওয়া হয়েছে। দরকার হলে পিনটি টেনে সরান বা আবার ট্যাপ করুন।';
    $('#e-loc').textContent = '';
    checkDup();
  }


  $('#gpsBtn').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('এই ব্রাউজারে লোকেশন পাওয়া যায় না।'); return; }
    $('#gpsBtn').disabled = true; $('#gpsBtn').textContent = 'লোকেশন খোঁজা হচ্ছে…';
    navigator.geolocation.getCurrentPosition(
      (p) => { setPick(p.coords.latitude, p.coords.longitude, true); resetGps(); },
      () => { toast('লোকেশন পাওয়া যায়নি। অনুমতি দিন, অথবা ম্যাপে ট্যাপ করুন।'); resetGps(); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
  function resetGps() { $('#gpsBtn').disabled = false; $('#gpsBtn').textContent = 'আমার বর্তমান লোকেশন ব্যবহার করুন'; }

  // Shrink photos in the browser before upload (faster on mobile data, smaller database)
  async function compress(file, max = 1280) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let q = 0.8, blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
      while (blob && blob.size > 400000 && q > 0.4) { q -= 0.1; blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q)); }
      if (!blob) throw new Error('compress');
      return blob;
    } finally { URL.revokeObjectURL(url); }
  }
  function showPhoto(blob) {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    photoPreview = blob ? URL.createObjectURL(blob) : null;
    $('#dropBox').innerHTML = blob ? `<img src="${photoPreview}" alt="নির্বাচিত ছবি"><span>ছবি বদলাতে ক্লিক করুন</span>` : '<span>ছবি তুলুন বা বেছে নিন</span>';
    $('#rmPhoto').hidden = !blob;
  }
  async function takePhoto(file) {
    if (!file || !/^image\//.test(file.type)) { toast('শুধু ছবি ফাইল দিন।'); return; }
    $('#dropBox').innerHTML = '<span>ছবি প্রস্তুত হচ্ছে…</span>';
    try { photoBlob = await compress(file); showPhoto(photoBlob); }
    catch { photoBlob = null; showPhoto(null); toast('ছবিটি পড়া যায়নি, অন্য ছবি দিন।'); }
  }
  $('#f-photo').addEventListener('change', (e) => takePhoto(e.target.files[0]));
  $('#dropBox').addEventListener('dragover', (e) => e.preventDefault());
  $('#dropBox').addEventListener('drop', (e) => { e.preventDefault(); takePhoto(e.dataTransfer.files[0]); });
  $('#rmPhoto').addEventListener('click', () => { photoBlob = null; $('#f-photo').value = ''; showPhoto(null); });

  let dupSeq = 0;
  async function checkDup() {
    const box = $('#dupBox');
    if (!pick || !selCat) { box.innerHTML = ''; return; }
    const seq = ++dupSeq;
    let near = [];
    try { near = (await api(`/api/reports/nearby?lat=${pick.lat}&lng=${pick.lng}&category=${selCat}`)).reports || []; } catch { /* ignore */ }
    if (seq !== dupSeq) return;
    if (!near.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="box warn"><h3>এই জায়গায় একই সমস্যা আগেই জানানো হয়েছে</h3>
      <p class="hint">একই সমস্যা হলে নতুন রিপোর্ট না করে সমর্থন যোগ করুন — এতে সমস্যাটির গুরুত্ব বাড়ে এবং অ্যাডমিনের কাজ সহজ হয়।</p>` +
      near.map((r) => `<div class="item static">${thumb(r)}<span><span class="meta">${pill(r.status)}<span>${bn(r.weight)} জন জানিয়েছেন</span></span>
        <h3>${esc(r.title)}</h3><span class="row mt">
        <button type="button" class="btn" data-sup="${esc(r.id)}" ${r.isMine || r.supported ? 'disabled' : ''}>${r.isMine ? 'এটি আপনার রিপোর্ট' : r.supported ? 'সমর্থন দেওয়া হয়েছে' : 'হ্যাঁ, এটাই আমার সমস্যা'}</button>
        <button type="button" class="btn g" data-open="${esc(r.id)}">বিস্তারিত</button></span></span></div>`).join('') +
      '<p class="hint">ভিন্ন সমস্যা হলে নিচের "সমস্যা জানান" বোতাম চাপুন।</p></div>';
  }

  $('#rform').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireLogin('new')) return;
    const title = $('#f-title').value.trim(), area = $('#f-area').value.trim();
    $('#e-cat').textContent = selCat ? '' : 'সমস্যার ধরন বেছে নিন।';
    $('#e-title').textContent = title.length >= 3 ? '' : 'সমস্যাটি সংক্ষেপে লিখুন।';
    $('#e-loc').textContent = pick ? '' : 'ম্যাপে লোকেশন বেছে নিন।';
    $('#e-area').textContent = area.length >= 2 ? '' : 'এলাকার নাম লিখুন।';
    $('#e-form').textContent = '';
    if (!selCat || title.length < 3 || !pick || area.length < 2) return;

    const fd = new FormData();
    fd.append('category', selCat); fd.append('title', title); fd.append('area', area);
    fd.append('description', $('#f-desc').value.trim()); fd.append('landmark', $('#f-land').value.trim());
    fd.append('lat', pick.lat); fd.append('lng', pick.lng);
    if (photoBlob) fd.append('photo', photoBlob, 'photo.jpg');

    const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = 'জমা হচ্ছে…';
    try {
      const { report } = await api('/api/reports', { method: 'POST', form: fd });
      $('#rform').hidden = true;
      const d = $('#doneBox'); d.hidden = false;
      d.innerHTML = `<div class="box ok"><h2>রিপোর্ট জমা হয়েছে, ধন্যবাদ!</h2><p>আপনার ট্র্যাকিং কোড</p>
        <div class="code">${esc(report.code)}</div>
        <p class="hint">অ্যাডমিন যাচাই করলে এবং কাজ শুরু হলে অগ্রগতি এখানে দেখা যাবে।</p>
        <div class="row center mt"><button class="btn" data-open="${esc(report.id)}">অগ্রগতি দেখুন</button><button class="btn g" id="again">আরেকটি সমস্যা জানান</button></div></div>`;
      $('#again').addEventListener('click', resetForm);
      loadReports();
    } catch (err) { $('#e-form').textContent = err.message; }
    btn.disabled = false; btn.textContent = 'সমস্যা জানান';
  });
  function resetForm() {
    $('#rform').reset(); selCat = null; pick = null; photoBlob = null; showPhoto(null);
    if (pickMarker) { pickMap.removeLayer(pickMarker); pickMarker = null; }
    $('#locTxt').textContent = 'এখনো লোকেশন বেছে নেওয়া হয়নি।'; $('#dupBox').innerHTML = '';
    $('#doneBox').hidden = true; $('#rform').hidden = false;
  }

  // ---------- support ----------
  async function support(id, btn) {
    if (!requireLogin(location.hash.slice(1) || 'map')) return;
    btn.disabled = true;
    try {
      await api(`/api/reports/${encodeURIComponent(id)}/support`, { method: 'POST' });
      toast('ধন্যবাদ! আপনার সমর্থন যোগ হয়েছে — সমস্যাটির গুরুত্ব বেড়েছে।');
      btn.textContent = 'সমর্থন দেওয়া হয়েছে';
      loadReports(); if (openId === id) openDetail(id);
    } catch (err) { toast(err.message); btn.disabled = false; }
  }

  // ---------- track ----------
  $('#tform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('#t-code').value.trim().toUpperCase(); $('#t-err').textContent = '';
    if (!q) { $('#t-err').textContent = 'ট্র্যাকিং কোড লিখুন।'; return; }
    try { const { report } = await api('/api/reports/code/' + encodeURIComponent(q)); showDetail(report); }
    catch (err) { $('#t-err').textContent = err.message; }
  });
  async function loadMine() {
    const box = $('#myList');
    if (!Auth.user) { box.innerHTML = '<div class="empty">নিজের রিপোর্ট দেখতে <a href="#login">লগইন করুন</a>।</div>'; return; }
    try {
      const { reports: mine } = await api('/api/reports?mine=1');
      box.innerHTML = mine.length ? mine.map(item).join('') : '<div class="empty">আপনি এখনো কোনো রিপোর্ট করেননি বা সমর্থন দেননি।</div>';
    } catch (err) { box.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  }

  // ---------- detail modal ----------
  function closeModal() { $('#ov').classList.remove('on'); openId = null; }
  async function openDetail(id) {
    try { const { report } = await api('/api/reports/' + encodeURIComponent(id)); showDetail(report); }
    catch (err) { toast(err.message); }
  }
  function showDetail(r) {
    openId = r.id;
    const idx = FLOW.indexOf(r.status), sc = stOf(r.status)[1];
    const canSupport = isOpen(r.status);
    $('#modal').innerHTML = `<button class="x" aria-label="বন্ধ করুন" data-close>×</button>
      <div class="meta">${pill(r.status)}<b>${esc(r.code)}</b><span>${esc(CATS[r.category] || '')}</span></div>
      <h2 class="mtitle">${esc(r.title)}</h2>
      <p class="meta"><span>${esc(r.area)}${r.landmark ? ' · ' + esc(r.landmark) : ''}</span><span>${date(r.createdAt)}</span>
        <a href="https://www.openstreetmap.org/?mlat=${+r.lat}&mlon=${+r.lng}#map=18/${+r.lat}/${+r.lng}" target="_blank" rel="noopener">ম্যাপে খুলুন</a></p>
      ${r.photo ? `<img class="photo" src="${esc(photoUrl(r.photo))}" alt="সমস্যার ছবি">` : ''}
      ${r.description ? `<p>${esc(r.description)}</p>` : ''}
      ${r.status === 'merged' ? `<div class="box mt">এই রিপোর্টটি একই সমস্যার মূল রিপোর্ট <button class="btn g" data-open="${esc(r.mergedInto)}">${esc(r.mergedIntoCode || 'দেখুন')}</button> এর সাথে একত্র করা হয়েছে। অগ্রগতি সেখানে দেখুন।</div>` : ''}
      ${r.status === 'rejected' ? '<div class="box mt">এই রিপোর্টটি বাতিল করা হয়েছে — কারণ নিচের ইতিহাসে দেখুন।</div>' : ''}
      ${idx >= 0 ? `<div class="steps">${FLOW.map((f, i) => `<div class="${i <= idx ? 'd' : ''}" style="--sc:${sc}">${ST[f][0]}</div>`).join('')}</div>` : ''}
      <div class="box mt"><b>${bn(r.weight)} জন</b> এই সমস্যাটি জানিয়েছেন — গুরুত্ব: <b>${SEV[r.severity] || ''}</b>
        ${r.mergedCount ? ` <span class="hint">(${bn(r.mergedCount)}টি ডুপ্লিকেট রিপোর্ট একত্র করা হয়েছে)</span>` : ''}
        ${canSupport ? `<div class="row mt"><button class="btn y" data-sup="${esc(r.id)}" ${r.isMine || r.supported ? 'disabled' : ''}>${r.isMine ? 'এটি আপনার রিপোর্ট' : r.supported ? 'আপনি সমর্থন দিয়েছেন' : 'আমারও একই সমস্যা'}</button></div>` : ''}</div>
      ${r.afterPhoto ? `<h3 class="mt2">সমাধানের পরের ছবি</h3><img class="photo mt" src="${esc(photoUrl(r.afterPhoto))}" alt="সমাধানের পরের ছবি">` : ''}
      <h3 class="mt2 mb">অগ্রগতির ইতিহাস</h3>
      <ul class="tl">${(r.history || []).map((h) => `<li style="--c:${stOf(h.status)[1]}"><b>${stOf(h.status)[0]}</b> <span class="hint">${date(h.at)}</span>${h.note ? `<div>${esc(h.note)}</div>` : ''}</li>`).join('')}</ul>
      ${Auth.isAdmin ? `<div class="row mt">${r.status !== 'merged' ? `<button class="btn" data-upd="${esc(r.id)}">অ্যাডমিন: অবস্থা আপডেট করুন</button>` : ''}<button class="btn danger" data-del="${esc(r.id)}">রিপোর্ট মুছুন</button></div>` : ''}`;
    $('#ov').classList.add('on');
    $('#modal .x').focus();
  }

  // ---------- admin ----------
  let aF = { status: 'open', category: 'all', sort: 'severity' };
  $('#aS').innerHTML = [['open', 'খোলা সব'], ['all', 'সব']].concat(Object.entries(ST).filter(([k]) => k !== 'merged').map(([k, v]) => [k, v[0]]))
    .map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  $('#aC').innerHTML = '<option value="all">সব ধরন</option>' + Object.entries(CATS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
  $('#aS').addEventListener('change', (e) => { aF.status = e.target.value; loadQueue(); });
  $('#aC').addEventListener('change', (e) => { aF.category = e.target.value; loadQueue(); });
  $('#aO').addEventListener('change', (e) => { aF.sort = e.target.value; loadQueue(); });
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('#tab-reports').hidden = b.dataset.tab !== 'reports'; $('#tab-users').hidden = b.dataset.tab !== 'users';
    if (b.dataset.tab === 'users') loadUsers();
  }));

  async function loadAdmin() {
    if (!Auth.isAdmin) { location.hash = '#map'; return; }
    try {
      const s = await api('/api/admin/stats');
      const n = (k) => s.status[k] || 0;
      $('#kpis').innerHTML = [[n('new'), 'নতুন — যাচাই বাকি'], [n('verified') + n('progress'), 'যাচাই হয়েছে / কাজ চলছে'], [n('resolved'), 'সমাধান হয়েছে'],
        [s.avgResolveDays == null ? '—' : s.avgResolveDays, 'গড় সমাধান সময় (দিন)'], [n('merged'), 'একত্রিত ডুপ্লিকেট'], [s.users, 'ব্যবহারকারী']]
        .map(([v, t]) => `<div class="kpi"><b>${bn(v)}</b><span>${t}</span></div>`).join('');
      const cm = Math.max(1, ...Object.values(s.byCategory));
      $('#catBars').innerHTML = Object.entries(s.byCategory).map(([k, v]) => `<div class="brow"><span>${CATS[k]}</span><span class="t"><i style="width:${v / cm * 100}%"></i></span><b>${bn(v)}</b></div>`).join('');
      const am = Math.max(1, ...s.byArea.map((a) => a.n));
      $('#areaBars').innerHTML = s.byArea.length ? s.byArea.map((a) => `<div class="brow"><span>${esc(a.area)}</span><span class="t"><i style="width:${a.n / am * 100}%"></i></span><b>${bn(a.n)}</b></div>`).join('') : '<p class="hint">কোনো খোলা সমস্যা নেই।</p>';
    } catch (err) { toast(err.message); }
    loadQueue();
  }
  async function loadQueue() {
    const q = $('#queue');
    try {
      const { reports: list } = await api(`/api/admin/reports?status=${aF.status}&category=${aF.category}&sort=${aF.sort}`);
      q.innerHTML = list.length ? list.map((r) => `<div class="q">${thumb(r)}<div>
        <span class="meta">${pill(r.status)}<b>${esc(r.code)}</b><span>${SEV[r.severity]} · ${bn(r.weight)} রিপোর্ট</span></span>
        <div class="qt">${esc(r.title)}</div>
        <span class="meta"><span>${esc(CATS[r.category] || '')}</span><span>${esc(r.area)}</span><span>${ago(r.createdAt)}</span>${r.reporter ? `<span>রিপোর্টার: ${esc(r.reporter.name)}${r.reporter.phone ? ' (' + esc(r.reporter.phone) + ')' : ''}</span>` : ''}</span></div>
        <div class="act row"><button class="btn g" data-open="${esc(r.id)}">দেখুন</button><button class="btn" data-upd="${esc(r.id)}">আপডেট</button><button class="btn danger" data-del="${esc(r.id)}" aria-label="মুছুন">মুছুন</button></div></div>`).join('')
        : '<div class="empty">এই ফিল্টারে কোনো রিপোর্ট নেই।</div>';
    } catch (err) { q.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  }
  async function loadUsers() {
    const t = $('#usersTable');
    try {
      const { users } = await api('/api/admin/users');
      const me = Auth.user?.id;
      t.innerHTML = '<thead><tr><th>নাম</th><th>ইমেইল</th><th>মোবাইল</th><th>রিপোর্ট</th><th>যোগদান</th><th>ভূমিকা</th></tr></thead><tbody>' +
        users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.phone || '—')}</td><td class="num">${bn(u.reports)}</td><td>${date(u.createdAt)}</td>
          <td>${String(u.id) === String(me) ? 'অ্যাডমিন (আপনি)' : `<select data-role="${esc(u.id)}" class="auto" aria-label="ভূমিকা"><option value="user"${u.role === 'user' ? ' selected' : ''}>নাগরিক</option><option value="admin"${u.role === 'admin' ? ' selected' : ''}>অ্যাডমিন</option></select>`}</td></tr>`).join('') + '</tbody>';
    } catch (err) { t.innerHTML = `<tbody><tr><td>${esc(err.message)}</td></tr></tbody>`; }
  }
  $('#usersTable').addEventListener('change', async (e) => {
    const s = e.target.closest('select[data-role]'); if (!s) return;
    try { await api(`/api/admin/users/${encodeURIComponent(s.dataset.role)}/role`, { method: 'PATCH', body: { role: s.value } }); toast('ভূমিকা বদলানো হয়েছে।'); }
    catch (err) { toast(err.message); loadUsers(); }
  });

  async function openUpdate(id) {
    let r, cands = [];
    try {
      [{ report: r }, { reports: cands }] = await Promise.all([
        api('/api/reports/' + encodeURIComponent(id)),
        api(`/api/admin/reports/${encodeURIComponent(id)}/merge-candidates`),
      ]);
    } catch (err) { toast(err.message); return; }
    openId = null;
    const next = { new: 'verified', verified: 'progress', progress: 'resolved' }[r.status] || r.status;
    let sel = next, afterBlob = null;
    $('#modal').innerHTML = `<button class="x" aria-label="বন্ধ করুন" data-close>×</button>
      <h2 class="mtitle">অবস্থা আপডেট: ${esc(r.code)}</h2><p class="hint">${esc(r.title)}</p>
      <span class="lab mt2">নতুন অবস্থা</span>
      <div class="sbtn" id="sb">${['verified', 'progress', 'resolved', 'rejected', 'merged'].map((k) => `<button type="button" data-s="${k}" style="--sc:${ST[k][1]}">${ST[k][0]}</button>`).join('')}</div>
      <div id="mergeBox" class="mt2" hidden><label for="u-to" class="lab">কোন মূল রিপোর্টের সাথে একত্র করবেন?</label>
        ${cands.length ? `<select id="u-to"><option value="">বেছে নিন…</option>${cands.map((k) => `<option value="${esc(k.id)}">${esc(k.code)} — ${esc(k.title)} (${esc(k.area)})</option>`).join('')}</select>` : '<p class="hint">২ কিমির মধ্যে একই ধরনের অন্য কোনো রিপোর্ট নেই।</p>'}</div>
      <div id="afterBox" class="mt2" hidden><span class="lab">সমাধানের পরের ছবি <span class="hint">(ঐচ্ছিক, নাগরিকদের আস্থা বাড়ায়)</span></span>
        <label class="drop" for="u-photo" id="uDrop"><span>ছবি বেছে নিন</span></label><input type="file" id="u-photo" accept="image/*" hidden></div>
      <label for="u-note" class="lab mt2">নাগরিকদের জন্য নোট</label>
      <textarea id="u-note" rows="3" maxlength="500" placeholder="যেমন: পৌরসভার দল আগামী রবিবার কাজ শুরু করবে"></textarea>
      <div class="err" id="u-err"></div>
      <div class="row mt"><button class="btn y" id="u-save">সংরক্ষণ করুন</button><button class="btn g" data-close>বাতিল</button></div>`;
    const sync = () => {
      $('#sb').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === sel)));
      $('#mergeBox').hidden = sel !== 'merged'; $('#afterBox').hidden = sel !== 'resolved';
    };
    sync();
    $('#sb').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { sel = b.dataset.s; sync(); } });
    $('#u-photo').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { afterBlob = await compress(f); $('#uDrop').innerHTML = `<img src="${URL.createObjectURL(afterBlob)}" alt=""><span>ছবি বদলাতে ক্লিক করুন</span>`; }
      catch { toast('ছবিটি পড়া যায়নি।'); }
    });
    $('#u-save').addEventListener('click', async () => {
      const note = $('#u-note').value.trim(), to = $('#u-to')?.value || '';
      $('#u-err').textContent = '';
      if (sel === 'merged' && !to) { $('#u-err').textContent = 'মূল রিপোর্ট বেছে নিন।'; return; }
      if (sel === 'rejected' && !note) { $('#u-err').textContent = 'বাতিলের কারণ লিখুন।'; return; }
      const fd = new FormData();
      fd.append('status', sel); fd.append('note', note);
      if (sel === 'merged') fd.append('mergedInto', to);
      if (sel === 'resolved' && afterBlob) fd.append('afterPhoto', afterBlob, 'after.jpg');
      $('#u-save').disabled = true;
      try {
        await api(`/api/admin/reports/${encodeURIComponent(id)}/status`, { method: 'PATCH', form: fd });
        toast('আপডেট সংরক্ষণ হয়েছে।');
        openDetail(id); loadReports(); if (location.hash === '#admin') loadAdmin();
      } catch (err) { $('#u-err').textContent = err.message; $('#u-save').disabled = false; }
    });
    $('#ov').classList.add('on');
  }

  // ---------- delete a fake report (admin) ----------
  async function confirmDelete(id) {
    let r;
    try { ({ report: r } = await api('/api/reports/' + encodeURIComponent(id))); } catch (err) { toast(err.message); return; }
    openId = null;
    $('#modal').innerHTML = `<button class="x" aria-label="বন্ধ করুন" data-close>×</button>
      <h2 class="mtitle">রিপোর্টটি মুছে ফেলবেন?</h2>
      <div class="box mt"><div class="meta">${pill(r.status)}<b>${esc(r.code)}</b><span>${esc(r.area)}</span></div><div class="qt">${esc(r.title)}</div></div>
      <p>রিপোর্ট, এর ছবি আর পুরো ইতিহাস <b>চিরতরে মুছে যাবে</b>, আর ফেরত আনা যাবে না।${r.mergedCount ? ` এর সাথে একত্র করা ${bn(r.mergedCount)}টি রিপোর্ট আবার আলাদা খোলা রিপোর্ট হয়ে যাবে।` : ''}</p>
      <p class="hint">আসল কিন্তু ভুল বা অপ্রাসঙ্গিক রিপোর্ট হলে মুছে না ফেলে <b>বাতিল</b> করাই ভালো — তাতে রিপোর্টকারী কারণটা দেখতে পায়।</p>
      <div class="err" id="d-err"></div>
      <div class="row mt"><button class="btn danger" id="d-yes">হ্যাঁ, মুছে ফেলুন</button><button class="btn g" data-close>না, রেখে দিন</button></div>`;
    $('#ov').classList.add('on');
    $('#d-yes').addEventListener('click', async () => {
      $('#d-yes').disabled = true;
      try {
        await api('/api/admin/reports/' + encodeURIComponent(id), { method: 'DELETE' });
        closeModal(); toast(r.code + ' মুছে ফেলা হয়েছে।');
        loadReports(); if (location.hash === '#admin') loadAdmin();
      } catch (err) { $('#d-err').textContent = err.message; $('#d-yes').disabled = false; }
    });
  }

  // ---------- global clicks ----------
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-close]') || t.id === 'ov') { closeModal(); return; }
    const sup = t.closest('[data-sup]'); if (sup) { support(sup.dataset.sup, sup); return; }
    const upd = t.closest('[data-upd]'); if (upd) { openUpdate(upd.dataset.upd); return; }
    const del = t.closest('[data-del]'); if (del) { confirmDelete(del.dataset.del); return; }
    const op = t.closest('[data-open]'); if (op) { openDetail(op.dataset.open); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#ov').classList.contains('on')) closeModal(); });

  // ---------- routing ----------
  const VIEWS = ['map', 'new', 'track', 'login', 'register', 'forgot', 'verify', 'admin'];
  function route() {
    let v = location.hash.slice(1);
    if (!VIEWS.includes(v)) v = 'map';
    if (v === 'new' && !requireLogin('new')) return;
    if (v === 'verify' && !pendingEmail) {
      try { pendingEmail = sessionStorage.getItem('ae_pending'); } catch { /* ignore */ }
      if (!pendingEmail) { location.hash = '#login'; return; }
    }
    if (v === 'admin' && !Auth.isAdmin) { location.hash = Auth.user ? '#map' : '#login'; return; }
    document.querySelectorAll('.view').forEach((s) => s.classList.toggle('on', s.id === 'v-' + v));
    document.querySelectorAll('nav a').forEach((a) => { if (a.dataset.v === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (v === 'map' && homeMap) setTimeout(() => homeMap.invalidateSize(), 50);
    if (v === 'new' && pickMap) setTimeout(() => pickMap.invalidateSize(), 50);
    if (v === 'track') loadMine();
    if (v === 'admin') loadAdmin();
    window.scrollTo(0, 0);
  }

  // ---------- start ----------
  homeMap = makeMap('homeMap'); homeLayer = L.layerGroup().addTo(homeMap);
  pickMap = makeMap('pickMap'); pickLayer = L.layerGroup().addTo(pickMap);
  pickMap.on('click', (e) => setPick(e.latlng.lat, e.latlng.lng, false));
  renderAuth();
  window.addEventListener('hashchange', route);
  route();
  loadReports();
  // Refresh the role (e.g. if an admin promoted this user) in the background
  if (Auth.token) api('/api/auth/me').then((d) => { Auth.setUser(d.user); renderAuth(); }).catch(() => {});
})();
