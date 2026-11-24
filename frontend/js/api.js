// Small helper for talking to the backend and remembering the login.
(function () {
  const BASE = (window.AMARELAKA_CONFIG && window.AMARELAKA_CONFIG.API_BASE) || '';
  const KEY_T = 'ae_token';
  const KEY_U = 'ae_user';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  const Auth = {
    get token() { return store.get(KEY_T); },
    get user() {
      try { return JSON.parse(store.get(KEY_U) || 'null'); } catch { return null; }
    },
    save(token, user) { store.set(KEY_T, token); store.set(KEY_U, JSON.stringify(user)); },
    setUser(user) { store.set(KEY_U, JSON.stringify(user)); },
    clear() { store.del(KEY_T); store.del(KEY_U); },
    get isAdmin() { return this.user?.role === 'admin'; },
  };

  // api('/api/reports', { method:'POST', body:{...} })  or  { form: FormData }
  async function api(path, opts = {}) {
    const headers = {};
    const token = Auth.token;
    if (token) headers.Authorization = 'Bearer ' + token;
    let body;
    if (opts.form) body = opts.form;
    else if (opts.body) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }

    let res;
    try {
      res = await fetch(BASE + path, { method: opts.method || 'GET', headers, body });
    } catch {
      throw new Error('সার্ভারে সংযোগ করা যায়নি। ইন্টারনেট দেখুন, অথবা একটু পরে আবার চেষ্টা করুন।');
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }

    if (res.status === 401 && token && !path.startsWith('/api/auth/login')) {
      Auth.clear();
      window.dispatchEvent(new Event('ae:logout'));
    }
    if (!res.ok) throw new Error(data.message || 'কিছু একটা সমস্যা হয়েছে।');
    return data;
  }

  const photoUrl = (id) => (id ? BASE + '/api/photos/' + encodeURIComponent(id) : '');

  window.AE = { api, Auth, photoUrl };
})();
