'use strict';
// BATTERYX-X frontend (vanilla JS SPA). All data comes from the API; all dynamic text is escaped.
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const e = s => String(s ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pretty = s => String(s || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, w => w.toLowerCase());
const fdate = d => d ? new Date(d).toLocaleDateString() : '—', fdt = d => d ? new Date(d).toLocaleString() : '—';
const pct = (n, t) => t ? Math.round(n / t * 100) : 0;
const STAGES = ['MANUFACTURED', 'INSTALLED', 'ACTIVE_USE', 'HEALTH_DECLINE', 'REMOVED', 'SECOND_LIFE', 'END_OF_LIFE', 'RECYCLED'];
let user = null, timer = null, token = localStorage.getItem('batteryx_token') || null;

async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' }; if (token) headers.Authorization = 'Bearer ' + token; const r = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && user && !path.startsWith('/auth/')) { token = null; localStorage.removeItem('batteryx_token'); user = null; go('/login'); }
  if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status, data: j });
  return j;
}
function toast(msg, type = 'ok') { const d = document.createElement('div'); d.className = 'note ' + type; d.textContent = msg; $('#toast').append(d); setTimeout(() => d.remove(), 4500); }
function go(p) { history.pushState({}, '', p); render(); }
window.onpopstate = render;
const busy = (btn, on) => { if (btn) { btn.disabled = on; } };

// ---------- charts ----------
function donut(items, centre, label) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1; let off = 0;
  const arcs = items.map(i => { const len = i.value / total * 100, a = `<circle r="15.9155" cx="21" cy="21" fill="none" stroke="${i.color}" stroke-width="5" stroke-dasharray="${len} ${100 - len}" stroke-dashoffset="${-off}" transform="rotate(-90 21 21)"><title>${e(i.label)}: ${i.value}</title></circle>`; off += len; return a; }).join('');
  return `<div class="donut"><svg viewBox="0 0 42 42"><circle r="15.9155" cx="21" cy="21" fill="none" stroke="#14261f" stroke-width="5"/>${arcs}<text x="21" y="21.5" text-anchor="middle" fill="#e9f5f0" font-size="6.5" font-weight="700">${e(centre)}</text><text x="21" y="27" text-anchor="middle" fill="#8aa398" font-size="3.4">${e(label)}</text></svg><div class="lg">${items.map(i => `<div><span><i style="background:${i.color}"></i>${e(i.label)}</span><b>${i.value} <small class="mut">(${pct(i.value, total)}%)</small></b></div>`).join('')}</div></div>`;
}
function lineChart(series, opts = {}) { // series: [{name,color,points:[{label,value}]}]
  const W = 600, H = 190, p = 30, all = series.flatMap(s => s.points.map(x => x.value)); if (!all.length) return '<div class="empty">No data for this range</div>';
  const mn = opts.min ?? Math.floor(Math.min(...all) - 3), mx = opts.max ?? Math.ceil(Math.max(...all) + 3), n = Math.max(...series.map(s => s.points.length));
  const X = i => p + (n > 1 ? i * (W - 2 * p) / (n - 1) : (W - 2 * p) / 2), Y = v => H - p - (v - mn) / ((mx - mn) || 1) * (H - 2 * p);
  const grid = [0, 1, 2, 3].map(i => { const v = mn + (mx - mn) * i / 3; return `<line x1="${p}" x2="${W - p}" y1="${Y(v)}" y2="${Y(v)}" stroke="#16291f"/><text x="4" y="${Y(v) + 3}" fill="#6f8a80" font-size="9">${v.toFixed(0)}</text>`; }).join('');
  const lab = series[0].points.map((pt, i) => (n <= 8 || i % Math.ceil(n / 8) === 0) ? `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" fill="#6f8a80" font-size="9">${e(pt.label)}</text>` : '').join('');
  const lines = series.map(s => `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" points="${s.points.map((pt, i) => `${X(i)},${Y(pt.value)}`).join(' ')}"/>${s.points.map((pt, i) => `<circle cx="${X(i)}" cy="${Y(pt.value)}" r="${opts.dots === false ? 0 : 4}" fill="${s.color}"><title>${e(s.name)} · ${e(pt.label)}: ${pt.value}</title></circle>`).join('')}`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${lab}${lines}</svg>`;
}

// ---------- layout ----------
function authShell(inner) { return `<div class="auth"><div class="auth-box"><div class="brand"><div class="logo">⚡</div><div><div class="bname">BATTERY<b>X-X</b></div><div class="eyebrow">Battery Intelligence Platform</div></div></div><div class="card">${inner}</div></div></div>`; }
const field = (label, name, type = 'text', extra = '') => `<label class="f"><span>${label}</span><input name="${name}" type="${type}" ${extra}></label>`;
const formData = f => Object.fromEntries(new FormData(f));
function form(sel, handler) { const f = $(sel); if (!f) return; f.onsubmit = async ev => { ev.preventDefault(); const b = $('button[type=submit]', f); busy(b, true); try { await handler(formData(f), f); } catch (err) { showErr(f, err.message); } finally { busy(b, false); } }; }
function showErr(f, m) { let n = $('.note.err', f); if (!n) { n = document.createElement('div'); n.className = 'note err'; f.prepend(n); } n.textContent = m; }

function layout(active, body) {
  const links = [['/dashboard', '⌂', 'Dashboard'], ['/batteries', '▣', 'Batteries'], ['/simulator', '⌁', 'What-If Simulator']];
  if (['ADMIN', 'RECYCLER'].includes(user.role)) links.push(['/recycling', '♻', 'Recycling Center']);
  if (['ADMIN', 'AUDITOR'].includes(user.role)) links.push(['/audit', '≡', 'Audit Log']);
  if (user.role === 'ADMIN') links.push(['/users', '☺', 'User Management']);
  links.push(['/settings', '⚙', 'Settings']);
  return `<div class="shell"><aside class="side" id="side"><div class="brand" style="justify-content:flex-start"><div class="logo">⚡</div><div><div class="bname">BATTERY<b>X-X</b></div><div class="eyebrow" style="font-size:8px">Battery Intelligence</div></div></div><nav>${links.map(([p, i, l]) => `<a class="nl ${active === p ? 'on' : ''}" href="${p}" data-link><span>${i}</span>${l}</a>`).join('')}</nav><div class="me"><div class="av">${e(user.name[0].toUpperCase())}</div><div class="grow"><b class="sm">${e(user.name)}</b><div class="eyebrow" style="font-size:8px">${e(user.role)}</div></div><button class="btn sm" id="logout" title="Sign out">↪</button></div></aside>
  <main class="main"><div class="top"><button class="btn menu-btn" id="menu">☰</button><form class="search" id="gsearch"><input name="q" placeholder="Search batteries by passport ID, serial or model…"></form><div class="live"><span class="dot"></span>Live</div><div class="av" title="${e(user.username)}">${e(user.name[0].toUpperCase())}</div></div><div id="page">${body}</div></main></div>`;
}
function bindLayout() {
  $('#logout').onclick = async () => { await api('/auth/logout', 'POST').catch(() => { }); token = null; localStorage.removeItem('batteryx_token'); user = null; go('/login'); };
  $('#menu').onclick = () => $('#side').classList.toggle('open');
  $('#gsearch').onsubmit = ev => { ev.preventDefault(); go('/batteries?search=' + encodeURIComponent(new FormData(ev.target).get('q'))); };
}

// ---------- auth pages ----------
function loginPage() {
  $('#app').innerHTML = authShell(`<div class="eyebrow">SECURE ACCESS</div><h1>Welcome back</h1><p class="mut">Sign in with your username or email.</p><div id="msg"></div><form id="f">${field('Username or email', 'identifier', 'text', 'required autocomplete="username"')}${field('Password', 'password', 'password', 'required autocomplete="current-password"')}<button class="btn pri full" type="submit">Sign in</button></form><p class="sm center"><a href="/forgot-password" data-link>Forgot password?</a></p><p class="sm center mut">New here? <a href="/signup" data-link>Create an account</a></p>`);
  form('#f', async d => {
    try { const r = await api('/auth/login', 'POST', d); token = r.token; localStorage.setItem('batteryx_token', token); user = r.user; go('/dashboard'); }
    catch (err) {
      if (err.data?.code === 'EMAIL_NOT_VERIFIED') {
        $('#msg').innerHTML = `<div class="note warn"><b>Email not verified</b><br>Please verify your email before accessing BATTERYX-X.<br>Verification email sent to: <b>${e(err.data.maskedEmail)}</b><br><br><button class="btn sm" id="rv">Resend Verification Email</button></div>`;
        $('#rv').onclick = async () => { try { const r = await api('/auth/resend-verification', 'POST', { email: err.data.email }); toast(r.message); } catch (x) { toast(x.message, 'err'); } };
      } else throw err;
    }
  });
}
function signupPage() {
  $('#app').innerHTML = authShell(`<div class="eyebrow">CREATE ACCOUNT</div><h1>Join BATTERYX-X</h1><p class="mut">Public accounts are created with the OWNER role. An administrator assigns elevated roles.</p><form id="f">${field('Full name', 'name', 'text', 'required')}${field('Username', 'username', 'text', 'required minlength=3')}${field('Email', 'email', 'email', 'required')}${field('Password', 'password', 'password', 'required minlength=8 autocomplete="new-password"')}${field('Confirm password', 'confirm', 'password', 'required minlength=8 autocomplete="new-password"')}<p class="sm mut">8+ characters with upper-case, lower-case and a number.</p><button class="btn pri full" type="submit">Create account</button></form><p class="sm center mut">Already registered? <a href="/login" data-link>Sign in</a></p>`);
  form('#f', async d => {
    if (d.password !== d.confirm) throw new Error('Passwords do not match');
    await api('/auth/signup', 'POST', d);
    $('.card').innerHTML = `<div class="center"><div class="big-ic">✓</div><h1>Account created successfully.</h1><p class="mut">Your OWNER account is ready. You can sign in now.</p><p><a class="btn pri" href="/login" data-link>Open Login</a></p></div>`;
  });
}
function forgotPage() {
  $('#app').innerHTML = authShell(`<div class="eyebrow">ACCOUNT RECOVERY</div><h1>Forgot password</h1><p class="mut">Enter your email and we'll send reset instructions if the account exists.</p><form id="f">${field('Email', 'email', 'email', 'required')}<button class="btn pri full" type="submit">Send reset link</button></form><p class="sm center"><a href="/login" data-link>Back to sign in</a></p>`);
  form('#f', async d => { const r = await api('/auth/forgot-password', 'POST', d); $('#f').innerHTML = `<div class="note ok">${e(r.message)}</div>`; });
}
function resetPage(token) {
  $('#app').innerHTML = authShell(`<div class="eyebrow">ACCOUNT RECOVERY</div><h1>Set a new password</h1><form id="f">${field('New password', 'password', 'password', 'required minlength=8 autocomplete="new-password"')}${field('Confirm password', 'confirm', 'password', 'required minlength=8 autocomplete="new-password"')}<button class="btn pri full" type="submit">Update password</button></form>`);
  form('#f', async d => { if (d.password !== d.confirm) throw new Error('Passwords do not match'); await api('/auth/reset-password', 'POST', { token, password: d.password }); $('.card').innerHTML = `<div class="center"><div class="big-ic">✓</div><h1>Password updated</h1><p><a class="btn pri" href="/login" data-link>Continue to Login</a></p></div>`; });
}
async function verifyPage(token) {
  $('#app').innerHTML = authShell(`<div class="center"><p class="mut">Verifying your email…</p></div>`);
  const resendBox = label => `<form id="rf" style="text-align:left;margin-top:14px">${field('Your email', 'email', 'email', 'required')}<button class="btn pri full" type="submit">${label}</button></form>`;
  const show = (ic, title, text, extra) => { $('.card').innerHTML = `<div class="center"><div class="big-ic">${ic}</div><h1>${title}</h1><p class="mut">${text}</p>${extra}</div>`; if ($('#rf')) form('#rf', async d => { const r = await api('/auth/resend-verification', 'POST', d); $('#rf').innerHTML = `<div class="note ok">${e(r.message)}</div>`; }); };
  const loginBtn = l => `<a class="btn pri" href="/login" data-link>${l}</a>`;
  try {
    const r = await api('/auth/verify-email?token=' + encodeURIComponent(token || ''));
    r.status === 'already_verified' ? show('✓', 'Already verified', 'Your email is already verified.', loginBtn('Go to Login')) : show('✓', 'Email Verified', 'Your BATTERYX-X account is now verified.', loginBtn('Continue to Login'));
  } catch (err) {
    if (err.status === 410) show('⏱', 'Verification link expired', 'Request a new link below.', resendBox('Send New Verification Email'));
    else if (err.status === 400) show('⚠', 'Invalid link', 'This verification link is invalid or has already been used.', resendBox('Request New Link'));
    else show('⚠', 'Something went wrong', 'We could not verify your email right now. Please try again later.', loginBtn('Go to Login'));
  }
}

// ---------- dashboard ----------
let range = '30d';
async function dashboardPage() {
  const d = await api('/dashboard?range=' + range), canAdd = ['ADMIN', 'MANUFACTURER'].includes(user.role);
  const delta = (cur, prev, inv) => { const df = +(cur - prev).toFixed(1); if (!df) return '<span class="flat">— vs last month</span>'; const good = inv ? df < 0 : df > 0; return `<span class="${good ? 'up' : 'down'}">${df > 0 ? '↑' : '↓'} ${Math.abs(df)}${'%'} vs last month</span>`; };
  const tp = d.totalPrev ? +((d.total - d.totalPrev) / d.totalPrev * 100).toFixed(1) : 0;
  const k = (l, v, t, extra = '') => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="t">${t}</div>${extra}</div>`;
  const H = d.health, hc = [['Healthy', '#2dd4a7'], ['Warning', '#f1c43a'], ['Critical', '#ef5f5f'], ['End-of-Life', '#8c62ff'], ['Retired', '#6f8a80']];
  const chc = { LFP: '#3aa7ff', NMC: '#8c62ff', NCA: '#2dd4a7', Other: '#8aa398' };
  const stageColor = '#2dd4a7';
  $('#page').innerHTML = `<div class="ph2"><div><div class="eyebrow">Battery Intelligence Platform</div><h1>Fleet Overview</h1><p class="mut" style="margin:0">Real-time battery fleet status and analytics · ${e(user.role)} scope</p></div><div class="row"><select id="range" style="width:auto">${[['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['6m', '6 months'], ['1y', '1 year'], ['all', 'All time']].map(([v, l]) => `<option value="${v}" ${v === range ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn" id="refresh">↻ Refresh</button><button class="btn" onclick="print()">Export Report</button>${canAdd ? '<a class="btn pri" href="/batteries?add=1" data-link>＋ Add Battery</a>' : ''}</div></div>
  <div class="kpis">${k('Total Batteries', d.total.toLocaleString(), tp ? `<span class="${tp > 0 ? 'up' : 'down'}">${tp > 0 ? '↑' : '↓'} ${Math.abs(tp)}% vs last month</span>` : '<span class="flat">— vs last month</span>')}${k('Active Use', d.active.toLocaleString(), `<span class="up">${pct(d.active, d.total)}% of fleet</span>`, `<div class="bar"><i style="width:${pct(d.active, d.total)}%"></i></div>`)}${k('Average SOH', d.avgSoh + '%', delta(d.avgSoh, d.avgSohPrev))}${k('Critical Risk', d.critical, `<span class="down">${pct(d.critical, d.total)}% of fleet</span>`)}${k('Near End-of-Life', d.nearEol, `<span class="flat">${pct(d.nearEol, d.total)}% of fleet</span>`)}${k('Second-Life', d.secondLife, `<span class="flat">${pct(d.secondLife, d.total)}% of fleet</span>`)}${k('Recycled', d.recycled, `<span class="flat">${pct(d.recycled, d.total)}% of fleet</span>`)}</div>
  <div class="g3"><div class="panel"><div class="ph"><h2>Fleet Health Distribution</h2></div>${donut(hc.map(([l, c]) => ({ label: l, value: H[l] || 0, color: c })), d.total.toLocaleString(), 'Batteries')}</div>
  <div class="panel"><div class="ph"><h2>Average SOH Trend</h2><span class="sm mut">${range === 'all' ? 'All time' : e(range.toUpperCase())}</span></div>${lineChart([{ name: 'Avg SOH', color: '#2dd4a7', points: d.trend.map(t => ({ label: t.label, value: t.value })) }])}</div>
  <div class="panel"><div class="ph"><h2>Chemistry Distribution</h2></div>${donut(['LFP', 'NMC', 'NCA', 'Other'].map(c => ({ label: c, value: d.chemistry[c] || 0, color: chc[c] })), d.total.toLocaleString(), 'Batteries')}</div></div>
  <div class="g3b"><div class="panel"><div class="ph"><h2>Lifecycle Stage</h2></div>${STAGES.map(s => `<div class="stage"><span>${pretty(s)}</span><div class="bar"><i style="width:${pct(d.stages[s], d.total)}%;background:${stageColor}"></i></div><b>${d.stages[s]}</b></div>`).join('')}</div>
  <div class="panel"><div class="ph"><h2>Top Risk Batteries</h2><a class="sm" href="/batteries" data-link>View All →</a></div><div class="scroll"><table class="tbl"><thead><tr><th>#</th><th>Battery</th><th>Vehicle</th><th>SOH</th><th>Temp</th><th>Cycles</th><th>Risk</th><th>Predicted EOL</th><th>Owner</th><th></th></tr></thead><tbody>${d.top.map(b => `<tr class="click" data-go="/batteries/${b.id}"><td>${b.rank}</td><td><b class="mono">${e(b.passportId)}</b><br><span class="mut mono">${e(b.serial)}</span></td><td>${b.vehicle ? e(b.vehicle.reg) + '<br><span class="mut sm">' + e(b.vehicle.make + ' ' + b.vehicle.model) + '</span>' : '<span class="mut">Unassigned</span>'}</td><td>${b.soh}%</td><td>${b.temp}°C</td><td>${b.cycles}</td><td><span class="pill ${b.riskLevel}">${b.riskLevel} · ${b.riskScore}</span></td><td>${b.eolDays} d</td><td>${e(b.owner)}</td><td><a href="/batteries/${b.id}" data-link>View</a></td></tr>`).join('') || '<tr><td colspan=10 class="empty">No batteries in your scope</td></tr>'}</tbody></table></div></div>
  <div class="panel"><div class="ph"><h2>Active Alerts</h2></div>${d.alerts.map(a => `<div class="alert" data-go="/batteries/${a.batteryId}"><span class="pill ${a.severity}">${a.severity[0]}</span><div class="grow"><b>${e(a.title)}</b><span class="mut">${e(a.detail)}</span></div></div>`).join('') || '<div class="empty">No alerts</div>'}</div></div>
  <div class="g3c"><div class="panel"><div class="ph"><h2>Fleet Performance</h2></div><div class="perf"><div><span class="mut sm">Avg Temperature</span><b>${d.performance.avgTemp}°C</b></div><div><span class="mut sm">Avg Cycles</span><b>${d.performance.avgCycles}</b></div><div><span class="mut sm">Avg Capacity</span><b>${d.performance.avgCapacity} kWh</b></div><div><span class="mut sm">Avg Voltage</span><b>${d.performance.avgVoltage} V</b></div></div></div>
  <div class="panel"><div class="ph"><h2>Insights</h2><span class="sm mut">rule-based, from live data</span></div>${d.insights.map(i => `<div class="ins"><span>${e(i.icon)}</span><div>${e(i.text)}</div></div>`).join('') || '<div class="empty">No insights yet</div>'}</div>
  <div class="panel"><div class="ph"><h2>Quick Actions</h2></div><div class="qa">${canAdd ? '<button data-go="/batteries?add=1"><b>＋ Add Battery</b><span class="mut sm">Register a battery</span></button>' : ''}<button data-go="/batteries"><b>▤ All Batteries</b><span class="mut sm">Manage fleet</span></button><button data-go="/simulator"><b>⌁ Simulation</b><span class="mut sm">What-if analysis</span></button><button onclick="print()"><b>⇩ Report</b><span class="mut sm">Print / save PDF</span></button></div></div></div>
  <p class="sm mut">Risk score = SOH loss + temperature + cycle wear + age + recent degradation (transparent rule-based "Battery Risk Score", not a trained ML model). Updated ${fdt(d.updatedAt)}.</p>`;
  $('#range').onchange = ev => { range = ev.target.value; dashboardPage(); }; $('#refresh').onclick = () => { dashboardPage(); toast('Dashboard refreshed'); };
  clearInterval(timer); timer = setInterval(() => { if (location.pathname === '/dashboard') dashboardPage().catch(() => { }); }, 60000);
}

// ---------- batteries ----------
let bq = { search: '', status: '', chemistry: '', vehicle: '', page: 1 };
async function batteriesPage() {
  const sp = new URLSearchParams(location.search); if (sp.has('search')) { bq = { ...bq, search: sp.get('search'), page: 1 }; history.replaceState({}, '', '/batteries'); }
  const canManage = ['ADMIN', 'MANUFACTURER'].includes(user.role), canCond = ['ADMIN', 'AUDITOR', 'OWNER'].includes(user.role), canRemove = user.role === 'ADMIN';
  $('#page').innerHTML = `<div class="ph2"><div><div class="eyebrow">Fleet / Asset registry</div><h1>Battery Fleet</h1><p class="mut" id="sub" style="margin:0"></p></div>${canManage ? '<button class="btn pri" id="add">＋ Add Battery</button>' : ''}</div><div class="panel"><form class="tools" id="flt"><input name="search" placeholder="Search passport / serial / model…" value="${e(bq.search)}"><input name="vehicle" placeholder="Vehicle registration" value="${e(bq.vehicle)}"><select name="status"><option value="">All stages</option>${STAGES.map(s => `<option value="${s}" ${bq.status === s ? 'selected' : ''}>${pretty(s)}</option>`).join('')}</select><select name="chemistry"><option value="">All chemistries</option>${['LFP', 'NMC', 'NCA', 'Other'].map(c => `<option ${bq.chemistry === c ? 'selected' : ''}>${c}</option>`).join('')}</select><button class="btn" type="submit">Apply</button></form><div class="scroll" id="tbl"><div class="empty">Loading…</div></div><div class="pager" id="pager"></div></div>`;
  $('#flt').onsubmit = ev => { ev.preventDefault(); bq = { ...bq, ...formData(ev.target), page: 1 }; loadList(); };
  if ($('#add')) $('#add').onclick = () => batteryModal();
  async function loadList() {
    try {
      const r = await api('/batteries?' + new URLSearchParams({ ...bq, pageSize: 25 }));
      $('#sub').textContent = `${r.total.toLocaleString()} batteries · serial-to-vehicle traceability · ${user.role === 'OWNER' ? 'only batteries assigned to you' : 'role: ' + user.role}`;
      $('#tbl').innerHTML = `<table class="tbl"><thead><tr><th>Passport / Serial</th><th>Model</th><th>Stage</th><th>Vehicle (current)</th><th>Owner</th><th>SOH</th><th>Risk</th><th>Actions</th></tr></thead><tbody>${r.data.map(b => `<tr><td><a class="mono" href="/batteries/${b.id}" data-link>${e(b.passportId)}</a><br><span class="mut mono">${e(b.serial)}</span></td><td>${e(b.model)} <span class="pill muted">${e(b.chemistry)}</span></td><td><span class="pill ${['HEALTH_DECLINE', 'END_OF_LIFE'].includes(b.status) ? 'warn' : ['REMOVED', 'RECYCLED'].includes(b.status) ? 'muted' : 'good'}">${pretty(b.status)}</span></td><td>${b.vehicle ? `<b>${e(b.vehicle.reg)}</b><br><span class="mut sm">${e(b.vehicle.make)} ${e(b.vehicle.model)}</span>` : '<span class="mut">Unassigned</span>'}</td><td>${e(b.owner)}</td><td>${b.soh}%</td><td><span class="pill ${b.riskLevel}">${b.riskLevel}</span></td><td class="row" style="gap:5px"><a class="btn sm" href="/batteries/${b.id}" data-link>View</a>${canManage ? `<button class="btn sm" data-edit="${b.id}">Edit</button>` : ''}${canCond ? `<a class="btn sm" href="/batteries/${b.id}?condition=1" data-link>Condition</a>` : ''}${canRemove && b.status !== 'REMOVED' ? `<button class="btn sm danger" data-rm="${b.id}" data-name="${e(b.passportId)}">Remove</button>` : ''}</td></tr>`).join('') || '<tr><td colspan=8 class="empty">No batteries match your filters</td></tr>'}</tbody></table>`;
      $('#pager').innerHTML = `<span>Page ${r.page} of ${r.totalPages}</span><span class="row"><button class="btn sm" ${r.page <= 1 ? 'disabled' : ''} id="pv">← Prev</button><button class="btn sm" ${r.page >= r.totalPages ? 'disabled' : ''} id="nx">Next →</button></span>`;
      $('#pv').onclick = () => { bq.page--; loadList(); }; $('#nx').onclick = () => { bq.page++; loadList(); };
      $$('[data-edit]').forEach(b => b.onclick = async () => batteryModal(await api('/batteries/' + b.dataset.edit)));
      $$('[data-rm]').forEach(b => b.onclick = () => removeModal(b.dataset.rm, b.dataset.name, loadList));
    } catch (err) { $('#tbl').innerHTML = `<div class="note err">${e(err.message)}</div>`; }
  }
  await loadList();
  if (sp.get('add') === '1' && canManage) { history.replaceState({}, '', '/batteries'); batteryModal(); }
}
function modal(html) { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="card">${html}</div>`; m.onmousedown = ev => { if (ev.target === m) m.remove(); }; document.body.append(m); $$('[data-close]', m).forEach(b => b.onclick = () => m.remove()); return m; }
async function batteryModal(b) {
  const [models, owners] = await Promise.all([api('/models'), api('/owners')]), vehicles = await api('/vehicles'), edit = !!b;
  const m = modal(`<div class="eyebrow">${edit ? 'Edit asset' : 'New asset'}</div><h1>${edit ? 'Update ' + e(b.passportId) : 'Add battery'}</h1><form id="bf"><div class="grid2">${field('Serial number', 'serial', 'text', `required ${edit ? 'disabled' : ''} value="${edit ? e(b.serial) : ''}"`)}<label class="f"><span>Battery model</span><select name="modelId" required>${models.map(x => `<option value="${x.id}" ${edit && x.id === b.modelId ? 'selected' : ''}>${e(x.name)} · ${e(x.chemistry)} · ${x.capacityKwh} kWh · ${x.voltage} V</option>`).join('')}</select></label>${field('Manufacturing date', 'mfgDate', 'date', `required value="${edit ? b.mfgDate.slice(0, 10) : new Date().toISOString().slice(0, 10)}"`)}${field('Weight (kg)', 'weightKg', 'number', `step=0.1 min=1 value="${edit ? (b.weightKg ?? '') : ''}"`)}
  <label class="f"><span>Vehicle (registration)</span><input name="vehicleReg" list="vl" placeholder="Unassigned" value="${edit && b.vehicle ? e(b.vehicle.reg) : ''}"><datalist id="vl">${vehicles.map(v => `<option value="${e(v.reg)}">${e(v.make)} ${e(v.model)}</option>`).join('')}</datalist></label>
  <label class="f"><span>Owner</span><select name="ownerId"><option value="">Unassigned</option>${owners.map(o => `<option value="${o.id}" ${edit && o.id === b.ownerId ? 'selected' : ''}>${e(o.name)} (${e(o.username)})</option>`).join('')}</select></label>
  ${edit ? '' : `<label class="f"><span>Lifecycle stage</span><select name="status">${STAGES.map(s => `<option value="${s}">${pretty(s)}</option>`).join('')}</select></label>${field('SOH (%)', 'soh', 'number', 'step=0.1 min=0 max=100 value=100')}${field('SOC (%)', 'soc', 'number', 'step=0.1 min=0 max=100 value=50')}${field('Cycle count', 'cycles', 'number', 'min=0 value=0')}${field('Temperature (°C)', 'temp', 'number', 'step=0.1 value=25')}`}</div>
  <div class="row sp"><button type="button" class="btn" data-close>Cancel</button><button class="btn pri" type="submit">${edit ? 'Save changes' : 'Create battery'}</button></div></form>`);
  form('#bf', async d => {
    const body = { modelId: +d.modelId, mfgDate: d.mfgDate, weightKg: d.weightKg ? +d.weightKg : undefined, vehicleReg: d.vehicleReg || (edit ? '' : undefined), ownerId: d.ownerId ? +d.ownerId : undefined };
    if (edit) await api('/batteries/' + b.id, 'PUT', body); else await api('/batteries', 'POST', { ...body, serial: d.serial, status: d.status, soh: +d.soh, soc: +d.soc, cycles: +d.cycles, temp: +d.temp });
    m.remove(); toast(edit ? 'Battery updated' : 'Battery added'); render();
  });
}
function removeModal(id, name, after) {
  const m = modal(`<div class="eyebrow">Confirm removal</div><h1>Remove ${e(name)}?</h1><p class="mut">The battery is set to <b>REMOVED</b>; its passport, history and audit trail are preserved. Any vehicle assignment is released.</p><form id="rf"><label class="f"><span>Reason (required)</span><textarea name="reason" required minlength=3></textarea></label><div class="row sp"><button type="button" class="btn" data-close>Cancel</button><button class="btn danger" type="submit">Remove battery</button></div></form>`);
  form('#rf', async d => { await api('/batteries/' + id, 'DELETE', d); m.remove(); toast(name + ' moved to REMOVED'); after(); });
}

// ---------- passport ----------
async function passportPage(id) {
  let b; try { b = await api('/batteries/' + id); } catch (err) { $('#page').innerHTML = `<div class="note err">${e(err.message)}</div><a href="/batteries" data-link>← Back to fleet</a>`; return; }
  const canCond = ['ADMIN', 'AUDITOR', 'OWNER'].includes(user.role); let tab = 'overview';
  const draw = () => {
    const v = b.vehicle, kv = (l, x) => `<div class="kv"><span>${l}</span><b>${e(x)}</b></div>`;
    const tabs = { overview: `<div class="cols"><div class="panel"><h2 style="margin-bottom:8px">Identity</h2>${kv('Passport ID', b.passportId)}${kv('Serial number', b.serial)}${kv('Manufacturer', b.manufacturer)}${kv('Model', b.model)}${kv('Chemistry', b.chemistry)}${kv('Manufacturing year', b.year)}${kv('Manufacturing date', fdate(b.mfgDate))}${kv('Nominal capacity', b.capacityKwh + ' kWh')}${kv('Nominal voltage', b.nominalVoltage + ' V')}${kv('Weight', b.weightKg ? b.weightKg + ' kg' : '—')}</div>
      <div class="panel"><h2 style="margin-bottom:8px">Serial → Vehicle mapping</h2><div class="note ok" style="margin-top:0"><b class="mono">${e(b.serial)}</b> → ${v ? `<b>${e(v.reg)}</b> (${e(v.make)} ${e(v.model)})` : 'no vehicle installed'}</div>${kv('Vehicle registration', v?.reg)}${kv('Vehicle manufacturer', v?.make)}${kv('Vehicle model', v?.model)}${kv('Vehicle owner', v?.owner)}${kv('Battery owner', b.owner)}</div>
      <div class="panel"><h2 style="margin-bottom:8px">Condition</h2>${kv('SOH', b.soh + '%')}${kv('SOC', b.soc + '%')}${kv('Cycle count', b.cycles)}${kv('Voltage / Current', b.voltage + ' V / ' + b.current + ' A')}${kv('Temperature', b.temp + '°C')}${kv('Measured capacity', b.measuredCapacity + ' kWh')}</div>
      <div class="panel"><h2 style="margin-bottom:8px">Risk &amp; end-of-life <span class="mut sm">(Battery Risk Score — rule-based)</span></h2>${kv('Risk score', b.riskScore + ' / 100')}${kv('Risk level', b.riskLevel)}${kv('Predicted EOL (SOH 70%)', b.eolDate)}${kv('Remaining useful life', b.eolDays + ' days')}${kv('Remaining cycles (est.)', b.remainingCycles)}${kv('Lifecycle chain integrity', b.chainValid ? '✓ verified' : '✗ tampered')}<p><a class="btn sm" href="/simulator?soh=${b.soh}" data-link>Open in What-If Simulator</a></p></div></div>`,
      health: `<div class="panel scroll"><div class="ph"><h2>SOH over time</h2></div>${lineChart([{ name: 'SOH', color: '#2dd4a7', points: [...b.history].reverse().map(h => ({ label: fdate(h.at), value: h.soh })) }])}<table class="tbl"><thead><tr><th>Recorded</th><th>SOH</th><th>SOC</th><th>Cycles</th><th>Temp</th><th>Stage</th><th>By</th><th>Reason</th></tr></thead><tbody>${b.history.map(h => `<tr><td>${fdt(h.at)}</td><td>${h.soh}%</td><td>${h.soc}%</td><td>${h.cycles}</td><td>${h.temp}°C</td><td>${pretty(h.status)}</td><td>${e(h.by)}</td><td>${e(h.reason)}</td></tr>`).join('')}</tbody></table></div>`,
      lifecycle: `<div class="panel"><div class="tl">${[...b.lifecycle].reverse().map(l => `<div><b>${pretty(l.to)}</b> <span class="mut sm">${fdt(l.at)} · ${e(l.by)}</span><br><span class="mut sm">${l.from ? pretty(l.from) + ' → ' : ''}${pretty(l.to)} — ${e(l.reason)}</span><br><span class="mono mut" style="font-size:10px">#${e(l.hash.slice(0, 16))}…</span></div>`).join('')}</div></div>`,
      vehicles: `<div class="panel scroll"><table class="tbl"><thead><tr><th>Vehicle</th><th>From</th><th>To</th></tr></thead><tbody>${b.vehicleHistory.map(h => `<tr><td>${e(h.vehicle)}</td><td>${fdate(h.from)}</td><td>${h.to ? fdate(h.to) : '<span class="pill good">Current</span>'}</td></tr>`).join('') || '<tr><td colspan=3 class="empty">No vehicle assignments</td></tr>'}</tbody></table></div>`,
      audit: `<div class="panel scroll"><table class="tbl"><thead><tr><th>When</th><th>Action</th><th>By</th><th>Old</th><th>New</th><th>Reason</th></tr></thead><tbody>${b.audit.map(a => `<tr><td>${fdt(a.at)}</td><td>${pretty(a.action)}</td><td>${e(a.by)}</td><td class="mono">${e(typeof a.old === 'object' ? JSON.stringify(a.old) : a.old)}</td><td class="mono">${e(typeof a.new === 'object' ? JSON.stringify(a.new) : a.new)}</td><td>${e(a.reason)}</td></tr>`).join('') || '<tr><td colspan=6 class="empty">No audit events yet</td></tr>'}</tbody></table></div>`,
      recycling: `<div class="panel">${b.recycling.map(r => `<div class="kv"><span>${e(r.code)}</span><b>${e(r.facility)} · ${fdate(r.date)}</b></div>`).join('') || '<div class="empty">This battery has not been recycled</div>'}</div>` };
    $('#page').innerHTML = `<a href="/batteries" data-link class="sm">← Back to fleet</a><div class="ph2" style="margin-top:8px"><div><div class="eyebrow">Digital Battery Passport</div><h1 class="mono" style="font-size:22px">${e(b.passportId)}</h1><p class="mut" style="margin:0">${e(b.serial)} · ${e(b.manufacturer)} ${e(b.model)} · ${e(b.chemistry)}</p></div>${canCond ? '<button class="btn pri" id="ec">✎ Edit condition</button>' : ''}</div>
    <div class="sum"><div><span>Lifecycle stage</span><b>${pretty(b.status)}</b></div><div><span>Vehicle</span><b>${v ? e(v.reg + ' · ' + v.make + ' ' + v.model) : 'Unassigned'}</b></div><div><span>Owner</span><b>${e(b.owner)}</b></div><div><span>Risk</span><b><span class="pill ${b.riskLevel}">${b.riskLevel} · ${b.riskScore}</span></b></div></div>
    <div class="tabs">${Object.keys(tabs).map(t => `<button class="${t === tab ? 'on' : ''}" data-tab="${t}">${t === 'health' ? 'Health history' : t === 'vehicles' ? 'Vehicle history' : t}</button>`).join('')}</div>${tabs[tab]}`;
    $$('[data-tab]').forEach(x => x.onclick = () => { tab = x.dataset.tab; draw(); }); if ($('#ec')) $('#ec').onclick = condModal;
  };
  function condModal() {
    const m = modal(`<div class="eyebrow">${e(user.role)} review</div><h1>Update battery condition</h1><p class="mut sm">Saving appends a new health record and audit event; previous values are retained.</p><form id="cf"><div class="grid2"><label class="f"><span>Condition / lifecycle stage</span><select name="status">${STAGES.map(s => `<option value="${s}" ${s === b.status ? 'selected' : ''}>${pretty(s)}</option>`).join('')}</select></label>${field('SOH (%)', 'soh', 'number', `required step=0.1 min=0 max=100 value="${b.soh}"`)}${field('SOC (%)', 'soc', 'number', `required step=0.1 min=0 max=100 value="${b.soc}"`)}${field('Cycle count', 'cycles', 'number', `required min=0 value="${b.cycles}"`)}${field('Temperature (°C)', 'temp', 'number', `required step=0.1 value="${b.temp}"`)}</div><label class="f"><span>Reason / inspection note (required)</span><textarea name="reason" required minlength=3></textarea></label><div class="row sp"><button type="button" class="btn" data-close>Cancel</button><button class="btn pri" type="submit">Save verified condition</button></div></form>`);
    form('#cf', async d => { b = await api(`/batteries/${id}/condition`, 'PATCH', { status: d.status, soh: +d.soh, soc: +d.soc, cycles: +d.cycles, temp: +d.temp, reason: d.reason }); m.remove(); toast('Condition saved — history and audit event created'); draw(); });
  }
  draw(); if (new URLSearchParams(location.search).get('condition') === '1' && canCond) { history.replaceState({}, '', '/batteries/' + id); condModal(); }
}

// ---------- simulator ----------
function simulatorPage() {
  const s0 = +(new URLSearchParams(location.search).get('soh') || 92);
  $('#page').innerHTML = `<div class="ph2"><div><div class="eyebrow">What-if analysis</div><h1>What-If Simulator</h1><p class="mut" style="margin:0">Simplified degradation model for planning. Not a certified engineering prediction.</p></div></div><div class="cols"><div class="panel"><form id="sf">${field('Starting SOH (%)', 'soh', 'number', `min=40 max=100 step=0.1 value=${s0}`)}${field('Average temperature (°C)', 'temp', 'number', 'min=0 max=60 value=30')}${field('Cycles per day', 'cpd', 'number', 'min=0.1 max=4 step=0.1 value=0.8')}<label class="f"><span>Usage intensity (charge/discharge rate)</span><select name="int"><option value="0.8">Gentle (≤0.5C)</option><option value="1" selected>Normal (~1C)</option><option value="1.3">Aggressive (fast charging)</option></select></label><button class="btn pri full" type="submit">Run simulation</button></form><div id="res" style="margin-top:14px"></div></div><div class="panel"><div class="ph"><h2>Projected SOH (8 years)</h2></div><div id="ch"></div><div class="row sm"><span><i style="color:#3aa7ff">●</i> Current</span><span><i style="color:#2dd4a7">●</i> Optimized</span><span><i style="color:#ef5f5f">●</i> High-stress</span></div></div></div>`;
  const rate = (t, c, i) => 2.2 * (1 + Math.max(0, t - 25) * .05) * (0.4 + c * .75) * i; // % SOH lost per year
  const run = d => {
    const soh = +d.soh, sc = [['Current', '#3aa7ff', +d.temp, +d.cpd, +d.int], ['Optimized', '#2dd4a7', Math.max(20, +d.temp - 8), +d.cpd * .8, Math.min(+d.int, .8)], ['High-stress', '#ef5f5f', +d.temp + 12, +d.cpd * 1.4, Math.max(+d.int, 1.3)]];
    const out = sc.map(([n, c, t, cy, i]) => { const r = rate(t, cy, i), yrs = soh > 70 ? (soh - 70) / r : 0; return { name: n, color: c, r, yrs, points: Array.from({ length: 9 }, (_, y) => ({ label: 'Y' + y, value: +Math.max(40, soh - r * y).toFixed(1) })) }; });
    $('#ch').innerHTML = lineChart(out, { min: 40, max: 100 });
    $('#res').innerHTML = out.map(o => `<div class="kv"><span style="color:${o.color}">${o.name}</span><b>${o.yrs.toFixed(1)} yrs to 70% SOH · ${(o.r).toFixed(1)}%/yr</b></div>`).join('') + `<div class="kv"><span>Remaining useful life gain (Optimized vs High-stress)</span><b>+${(out[1].yrs - out[2].yrs).toFixed(1)} yrs</b></div>`;
  };
  form('#sf', async d => run(d)); run({ soh: s0, temp: 30, cpd: .8, int: 1 });
}

// ---------- recycling ----------
async function recyclingPage() {
  let r; try { r = await api('/recycling'); } catch (err) { $('#page').innerHTML = `<div class="note err">${e(err.message)}</div>`; return; }
  $('#page').innerHTML = `<div class="ph2"><div><div class="eyebrow">Circularity / Recycler</div><h1>Recycling Center</h1><p class="mut" style="margin:0">End-of-life queue, recycling batches and recovered materials.</p></div></div>
  <div class="sum"><div><span>End-of-life queue</span><b>${r.eolTotal}</b></div><div><span>Recycled batteries</span><b>${r.recycledTotal}</b></div><div><span>Batches</span><b>${r.batches.length}</b></div><div><span>Recovered (kg)</span><b class="sm">Li ${r.totals.lithium} · Ni ${r.totals.nickel} · Co ${r.totals.cobalt}<br>Cu ${r.totals.copper} · Al ${r.totals.aluminum}</b></div></div>
  <div class="cols"><div class="panel"><div class="ph"><h2>Ready for recycling (select batteries)</h2></div><div class="scroll" style="max-height:420px;overflow:auto"><table class="tbl"><thead><tr><th></th><th>Passport</th><th>Serial</th><th>SOH</th></tr></thead><tbody>${r.eol.map(b => `<tr><td><input type="checkbox" class="chk" value="${b.id}"></td><td class="mono">${e(b.passportId)}</td><td class="mono">${e(b.serial)}</td><td>${b.soh}%</td></tr>`).join('') || '<tr><td colspan=4 class="empty">Queue is empty</td></tr>'}</tbody></table></div></div>
  <div class="panel"><div class="ph"><h2>Create recycling batch</h2></div><form id="rb">${field('Recycling facility', 'facility', 'text', 'required value="GreenCycle Recovery"')}${field('Recycling date', 'date', 'date', `value="${new Date().toISOString().slice(0, 10)}"`)}<div class="grid2">${['lithium', 'nickel', 'cobalt', 'copper', 'aluminum'].map(m => field('Recovered ' + m + ' (kg)', m, 'number', 'min=0 step=0.1 value=0')).join('')}</div><button class="btn pri full" type="submit">Create batch from selected</button></form></div></div>
  <div class="panel" style="margin-top:12px"><div class="ph"><h2>Recycling batches</h2></div><div class="scroll"><table class="tbl"><thead><tr><th>Batch</th><th>Facility</th><th>Date</th><th>Batteries</th><th>Li</th><th>Ni</th><th>Co</th><th>Cu</th><th>Al</th><th>By</th></tr></thead><tbody>${r.batches.map(x => `<tr><td class="mono">${e(x.code)}</td><td>${e(x.facility)}</td><td>${fdate(x.date)}</td><td>${x.count}</td><td>${x.materials.lithium}</td><td>${x.materials.nickel}</td><td>${x.materials.cobalt}</td><td>${x.materials.copper}</td><td>${x.materials.aluminum}</td><td>${e(x.createdBy)}</td></tr>`).join('')}</tbody></table></div></div>`;
  form('#rb', async d => {
    const ids = $$('.chk:checked').map(c => +c.value); if (!ids.length) throw new Error('Select at least one battery');
    await api('/recycling', 'POST', { batteryIds: ids, facility: d.facility, date: d.date, materials: Object.fromEntries(['lithium', 'nickel', 'cobalt', 'copper', 'aluminum'].map(k => [k, +d[k] || 0])) });
    toast(`Batch created with ${ids.length} batteries`); recyclingPage();
  });
}

// ---------- users & audit ----------
async function usersPage() {
  const list = await api('/users');
  $('#page').innerHTML = `<div class="ph2"><div><div class="eyebrow">Administration</div><h1>User Management</h1></div><button class="btn pri" id="nu">＋ Create user</button></div><div class="panel scroll"><table class="tbl"><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Last login</th><th>Actions</th></tr></thead><tbody>${list.map(u => `<tr><td>${e(u.name)}</td><td>${e(u.username)}</td><td>${e(u.email)} ${u.emailVerified ? '' : '<span class="pill warn">unverified</span>'}</td><td><select data-role="${u.id}" ${u.id === user.id ? 'disabled' : ''} style="width:auto">${['ADMIN', 'OWNER', 'AUDITOR', 'RECYCLER', 'MANUFACTURER'].map(r => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td><td><span class="pill ${u.active ? 'good' : 'badc'}">${u.active ? 'Active' : 'Disabled'}</span></td><td>${fdate(u.createdAt)}</td><td>${fdt(u.lastLogin)}</td><td class="row" style="gap:5px">${u.id !== user.id ? `<button class="btn sm" data-tg="${u.id}" data-on="${u.active}">${u.active ? 'Disable' : 'Enable'}</button>` : ''}<button class="btn sm" data-rp="${u.id}">Send reset link</button></td></tr>`).join('')}</tbody></table></div>`;
  $$('[data-role]').forEach(s => s.onchange = async () => { try { await api('/users/' + s.dataset.role, 'PATCH', { role: s.value }); toast('Role updated'); } catch (x) { toast(x.message, 'err'); } });
  $$('[data-tg]').forEach(b => b.onclick = async () => { try { await api('/users/' + b.dataset.tg, 'PATCH', { active: b.dataset.on !== 'true' }); usersPage(); } catch (x) { toast(x.message, 'err'); } });
  $$('[data-rp]').forEach(b => b.onclick = async () => { try { toast((await api(`/users/${b.dataset.rp}/reset-password`, 'POST')).message); } catch (x) { toast(x.message, 'err'); } });
  $('#nu').onclick = () => { const m = modal(`<div class="eyebrow">Administration</div><h1>Create user</h1><p class="mut sm">The user receives an email link to set their own password.</p><form id="uf">${field('Full name', 'name', 'text', 'required')}${field('Username', 'username', 'text', 'required')}${field('Email', 'email', 'email', 'required')}<label class="f"><span>Role</span><select name="role">${['OWNER', 'AUDITOR', 'RECYCLER', 'MANUFACTURER', 'ADMIN'].map(r => `<option>${r}</option>`).join('')}</select></label><div class="row sp"><button type="button" class="btn" data-close>Cancel</button><button class="btn pri" type="submit">Create</button></div></form>`); form('#uf', async d => { const r = await api('/users', 'POST', d); m.remove(); toast(r.message); usersPage(); }); };
}
let aq = '', ap = 1;
async function auditPage() {
  const r = await api(`/audit?page=${ap}&q=${encodeURIComponent(aq)}`);
  $('#page').innerHTML = `<div class="ph2"><div><div class="eyebrow">Compliance</div><h1>Audit Log</h1><p class="mut" style="margin:0">${r.total.toLocaleString()} events</p></div><form id="aqf" class="row"><input name="q" placeholder="Filter action / user…" value="${e(aq)}" style="width:240px"><button class="btn" type="submit">Filter</button></form></div><div class="panel scroll"><table class="tbl"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Old</th><th>New</th>${user.role === 'ADMIN' ? '<th>IP</th>' : ''}</tr></thead><tbody>${r.data.map(a => `<tr><td>${fdt(a.at)}</td><td>${e(a.userName)}</td><td><b>${e(a.action)}</b></td><td>${e(a.entityType)} ${e(a.entityId ?? '')}</td><td class="mono">${e(typeof a.old === 'object' ? JSON.stringify(a.old) : a.old)}</td><td class="mono">${e(typeof a.new === 'object' ? JSON.stringify(a.new) : a.new)}</td>${user.role === 'ADMIN' ? `<td class="mono">${e(a.ip)}</td>` : ''}</tr>`).join('')}</tbody></table><div class="pager"><span>Page ${r.page}</span><span class="row"><button class="btn sm" id="ap" ${ap <= 1 ? 'disabled' : ''}>← Newer</button><button class="btn sm" id="an" ${ap * 50 >= r.total ? 'disabled' : ''}>Older →</button></span></div></div>`;
  $('#aqf').onsubmit = ev => { ev.preventDefault(); aq = new FormData(ev.target).get('q'); ap = 1; auditPage(); }; $('#ap').onclick = () => { ap--; auditPage(); }; $('#an').onclick = () => { ap++; auditPage(); };
}

// ---------- settings ----------
async function settingsPage() {
  const s = await api('/auth/security');
  $('#page').innerHTML = `<div class="ph2"><div><div class="eyebrow">Account</div><h1>Settings</h1></div></div><div class="cols"><div class="panel"><h2 style="margin-bottom:10px">Profile</h2><form id="pf">${field('Username', 'username', 'text', `required value="${e(user.username)}"`)}${field('Full name', 'name', 'text', `required value="${e(user.name)}"`)}${field('Email', 'x', 'text', `disabled value="${e(user.email)}"`)}${field('Role', 'y', 'text', `disabled value="${e(user.role)}"`)}<button class="btn pri" type="submit">Save profile</button></form></div>
  <div class="panel"><h2 style="margin-bottom:10px">Security</h2><div class="kv"><span>Email verification</span><b class="${s.emailVerified ? 'up' : 'down'}">${s.emailVerified ? '✓ Verified' : 'Not verified'} (${e(s.email)})</b></div><div class="kv"><span>Password last changed</span><b>${fdt(s.passwordChangedAt)}</b></div><div class="kv"><span>MFA</span><b>${e(s.mfa)}</b></div><div class="row" style="margin-top:12px"><button class="btn" id="cp">Change Password</button><button class="btn" id="ce">Change Email</button><button class="btn" id="mfa">Enable MFA</button><button class="btn" id="so">Sign Out Other Sessions</button></div></div>
  <div class="panel"><h2 style="margin-bottom:10px">Active sessions</h2>${s.sessions.map(x => `<div class="kv"><span>${e(x.ua || 'Unknown device').slice(0, 60)}</span><b>${x.current ? '<span class="pill good">This session</span>' : fdt(x.createdAt)}</b></div>`).join('')}</div>
  <div class="panel"><h2 style="margin-bottom:10px">Recent security events</h2>${s.events.map(x => `<div class="kv"><span>${pretty(x.action)}</span><b class="sm">${fdt(x.at)}</b></div>`).join('') || '<div class="empty">No events</div>'}</div></div>`;
  form('#pf', async d => { user = await api('/auth/profile', 'PUT', d); toast('Profile updated'); settingsPage(); });
  $('#mfa').onclick = () => toast('MFA (TOTP) is not enabled in this build; the session/auth layer is structured so it can be added.', 'warn');
  $('#so').onclick = async () => { try { toast((await api('/auth/sign-out-others', 'POST')).message); settingsPage(); } catch (x) { toast(x.message, 'err'); } };
  $('#cp').onclick = () => { const m = modal(`<h1>Change password</h1><form id="cf">${field('Current password', 'currentPassword', 'password', 'required')}${field('New password', 'newPassword', 'password', 'required minlength=8 autocomplete="new-password"')}${field('Confirm new password', 'confirm', 'password', 'required minlength=8')}<div class="row sp"><button type="button" class="btn" data-close>Cancel</button><button class="btn pri" type="submit">Change password</button></div></form>`); form('#cf', async d => { if (d.newPassword !== d.confirm) throw new Error('New passwords do not match'); const r = await api('/auth/change-password', 'POST', { currentPassword: d.currentPassword, newPassword: d.newPassword }); m.remove(); toast(r.message); }); };
  $('#ce').onclick = () => { const m = modal(`<h1>Change email</h1><p class="mut sm">A verification link is sent to the new address. Your email only changes after you confirm it.</p><form id="ef">${field('New email', 'newEmail', 'email', 'required')}${field('Current password', 'password', 'password', 'required')}<div class="row sp"><button type="button" class="btn" data-close>Cancel</button><button class="btn pri" type="submit">Send verification</button></div></form>`); form('#ef', async d => { const r = await api('/auth/change-email', 'POST', d); m.remove(); toast(r.message); }); };
}

// ---------- router ----------
async function render() {
  clearInterval(timer); const p = location.pathname, q = new URLSearchParams(location.search);
  if (user === null && !['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email'].includes(p)) { try { user = await api('/auth/me'); } catch { user = null; } }
  const open = ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email'];
  if (!user && !open.includes(p)) return go('/login');
  if (user && ['/login', '/signup', '/'].includes(p)) return go('/dashboard');
  if (p === '/login') return loginPage(); if (p === '/signup') return signupPage(); if (p === '/forgot-password') return forgotPage();
  if (p === '/reset-password') return resetPage(q.get('token')); if (p === '/verify-email') return verifyPage(q.get('token'));
  const bm = p.match(/^\/batteries\/(\d+)$/), map = { '/dashboard': dashboardPage, '/batteries': batteriesPage, '/simulator': simulatorPage, '/recycling': recyclingPage, '/users': usersPage, '/audit': auditPage, '/settings': settingsPage };
  const fn = bm ? () => passportPage(bm[1]) : map[p]; if (!fn) return go('/dashboard');
  $('#app').innerHTML = layout(bm ? '/batteries' : p, '<div class="empty">Loading…</div>'); bindLayout();
  try { await fn(); } catch (err) { $('#page').innerHTML = `<div class="note err">${e(err.message)}</div>`; }
}
document.addEventListener('click', ev => {
  const a = ev.target.closest('a[data-link]'); if (a && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); go(a.getAttribute('href')); return; }
  const g = ev.target.closest('[data-go]'); if (g) go(g.dataset.go);
});
render();
