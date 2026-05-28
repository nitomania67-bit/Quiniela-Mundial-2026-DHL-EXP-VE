// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  user: null,
  matches: [],
  myPredictions: {},
  currentPage: 'ranking',
  adminTab: 'users',
};

// ─── API HELPER ──────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

// ─── INIT ────────────────────────────────────────────────────────────────────
async function init() {
  try {
    state.user = await api('GET', '/api/me');
  } catch (e) { state.user = null; }

  if (!state.user) { renderLogin(); return; }
  await loadMatches();
  if (!state.user.isAdmin) await loadMyPredictions();
  renderApp();
}

async function loadMatches() {
  state.matches = await api('GET', '/api/matches');
}

async function loadMyPredictions() {
  const preds = await api('GET', '/api/predictions/mine');
  state.myPredictions = {};
  for (const p of preds) state.myPredictions[p.match_id] = p;
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────
function navigate(page) {
  state.currentPage = page;
  renderApp();
}

// ─── RENDER ROOT ─────────────────────────────────────────────────────────────
function renderApp() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const nav = buildNav();
  app.appendChild(nav);

  const main = document.createElement('main');
  app.appendChild(main);

  switch (state.currentPage) {
    case 'ranking': renderRanking(main); break;
    case 'quiniela': renderQuiniela(main); break;
    case 'resultados': renderResultados(main); break;
    case 'admin': renderAdmin(main); break;
    default: renderRanking(main);
  }
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
function buildNav() {
  const nav = document.createElement('nav');
  nav.innerHTML = `
    <div class="nav-logo">⚽ <span>MUNDIAL</span> 2026</div>
    <div class="nav-links">
      <button class="nav-link ${state.currentPage==='ranking'?'active':''}" onclick="navigate('ranking')">🏆 Ranking</button>
      ${!state.user.isAdmin ? `<button class="nav-link ${state.currentPage==='quiniela'?'active':''}" onclick="navigate('quiniela')">📋 Mi Quiniela</button>` : ''}
      <button class="nav-link ${state.currentPage==='resultados'?'active':''}" onclick="navigate('resultados')">⚽ Resultados</button>
      ${state.user.isAdmin ? `<button class="nav-link ${state.currentPage==='admin'?'active':''}" onclick="navigate('admin')">⚙️ Admin</button>` : ''}
    </div>
    <div class="nav-right">
      <span class="nav-user">👤 ${escHtml(state.user.displayName)}</span>
      <button class="btn-logout" onclick="logout()">Salir</button>
    </div>
  `;
  return nav;
}

async function logout() {
  await api('POST', '/api/logout');
  state.user = null;
  renderLogin();
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────
function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-title">QUINIELA<br><span>MUNDIAL 2026</span></div>
        <p class="login-subtitle">⚽ Ingresa con tu usuario y contraseña</p>
        <div id="login-error"></div>
        <div class="form-group">
          <label>Usuario</label>
          <input type="text" id="login-user" placeholder="tu_usuario" />
        </div>
        <div class="form-group">
          <label>Contraseña</label>
          <input type="password" id="login-pass" placeholder="••••••••" />
        </div>
        <button class="btn btn-primary btn-full" onclick="doLogin()">Entrar</button>
      </div>
    </div>
  `;
  document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  try {
    state.user = await api('POST', '/api/login', { username, password });
    await loadMatches();
    if (!state.user.isAdmin) await loadMyPredictions();
    renderApp();
  } catch (e) {
    errEl.innerHTML = `<div class="alert alert-error">${escHtml(e.message)}</div>`;
  }
}

// ─── RANKING ─────────────────────────────────────────────────────────────────
async function renderRanking(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>🏆 Tabla de Posiciones</h1>
      <p>Actualizada en tiempo real según los resultados del Mundial</p>
    </div>
    <div id="ranking-content"><p style="color:var(--text-muted)">Cargando...</p></div>
  `;

  try {
    const ranking = await api('GET', '/api/ranking');
    const played = ranking[0]?.played || 0;
    const totalMatches = state.matches.length;

    let html = `
      <div class="stats-row">
        <div class="stat-card"><div class="stat-label">Participantes</div><div class="stat-value">${ranking.length}</div></div>
        <div class="stat-card"><div class="stat-label">Partidos jugados</div><div class="stat-value">${played}</div></div>
        <div class="stat-card"><div class="stat-label">Total partidos</div><div class="stat-value">${totalMatches}</div></div>
      </div>
    `;

    if (ranking.length === 0) {
      html += `<div class="empty-state"><div class="icon">👥</div><h3>Sin participantes aún</h3><p>El admin debe crear usuarios primero.</p></div>`;
    } else {
      html += `<div class="card" style="padding: 0; overflow: hidden;">
        <table class="ranking-table">
          <thead><tr>
            <th style="width:48px">#</th>
            <th>Participante</th>
            <th>Puntos</th>
            <th>Exactos</th>
            <th>Ganador</th>
            <th>Quiniela</th>
          </tr></thead>
          <tbody>`;

      ranking.forEach((r, i) => {
        const pos = i + 1;
        const posClass = pos === 1 ? 'rank-1' : pos === 2 ? 'rank-2' : pos === 3 ? 'rank-3' : '';
        const totalM = state.matches.length;
        const complete = r.total >= totalM;
        html += `<tr>
          <td class="rank-pos ${posClass}">${pos}</td>
          <td class="rank-name">${escHtml(r.displayName)}</td>
          <td><span class="pts-big">${r.points}</span></td>
          <td><span class="badge badge-green">✓ ${r.exact}</span></td>
          <td><span class="badge badge-gold">~ ${r.winner}</span></td>
          <td>${complete ? `<span class="badge badge-green">Completa</span>` : `<span class="badge badge-muted">${r.total}/${totalM}</span>`}</td>
        </tr>`;
      });

      html += `</tbody></table></div>`;
    }

    document.getElementById('ranking-content').innerHTML = html;
  } catch (e) {
    document.getElementById('ranking-content').innerHTML = `<div class="alert alert-error">Error: ${escHtml(e.message)}</div>`;
  }
}

// ─── MI QUINIELA ─────────────────────────────────────────────────────────────
async function renderQuiniela(container) {
  const totalMatches = state.matches.length;
  const filledCount = Object.keys(state.myPredictions).length;
  const isComplete = filledCount >= totalMatches;

  const pct = totalMatches > 0 ? Math.round(filledCount / totalMatches * 100) : 0;

  container.innerHTML = `
    <div class="page-header">
      <h1>📋 Mi Quiniela</h1>
      <p>Ingresa tu predicción para todos los partidos</p>
    </div>
    ${isComplete ? `
      <div class="completed-banner">
        <div class="icon">🔒</div>
        <div>
          <strong>¡Quiniela enviada y bloqueada!</strong>
          <span>Ya no puedes modificar tus predicciones. ¡Suerte!</span>
        </div>
      </div>` : `
      <div class="progress-wrap">
        <div class="progress-info">
          <span>Partidos completados</span>
          <span><strong>${filledCount}</strong> / ${totalMatches}</span>
        </div>
        <div class="progress-bar-bg"><div class="progress-bar" style="width:${pct}%"></div></div>
      </div>
      <div class="alert alert-info">⚠️ Una vez que guardes todos los partidos, tu quiniela quedará <strong>bloqueada</strong> y no podrás modificarla.</div>
    `}
  `;

  const phases = ['Grupos', 'Octavos', 'Cuartos', 'Semis', 'Tercer Lugar', 'Final'];
  const phaseIcons = { 'Grupos': '🌍', 'Octavos': '⚡', 'Cuartos': '🔥', 'Semis': '💥', 'Tercer Lugar': '🥉', 'Final': '🏆' };

  for (const phase of phases) {
    const phaseMatches = state.matches.filter(m => m.phase === phase);
    if (phaseMatches.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'phase-section';
    section.innerHTML = `<div class="phase-title">${phaseIcons[phase]||'⚽'} ${phase}</div>`;

    if (phase === 'Grupos') {
      const groups = {};
      for (const m of phaseMatches) {
        if (!groups[m.group_name]) groups[m.group_name] = [];
        groups[m.group_name].push(m);
      }
      for (const [g, gMatches] of Object.entries(groups).sort()) {
        const gs = document.createElement('div');
        gs.className = 'group-section';
        gs.innerHTML = `<div class="group-label">Grupo ${g}</div>`;
        const grid = document.createElement('div');
        grid.className = 'matches-grid';
        for (const m of gMatches) {
          grid.appendChild(buildMatchCard(m, isComplete));
        }
        gs.appendChild(grid);
        section.appendChild(gs);
      }
    } else {
      const grid = document.createElement('div');
      grid.className = 'matches-grid';
      for (const m of phaseMatches) {
        grid.appendChild(buildMatchCard(m, isComplete));
      }
      section.appendChild(grid);
    }

    container.appendChild(section);
  }

  if (!isComplete) {
    const saveBtn = document.createElement('div');
    saveBtn.style.cssText = 'position: sticky; bottom: 1.5rem; display: flex; justify-content: center; padding: 1rem 0;';
    saveBtn.innerHTML = `
      <button class="btn btn-gold" style="font-size:1rem; padding: 14px 40px;" onclick="saveAllPredictions()">
        💾 Guardar Quiniela (${filledCount}/${totalMatches})
      </button>
    `;
    container.appendChild(saveBtn);
  }
}

function buildMatchCard(match, isComplete) {
  const pred = state.myPredictions[match.id];
  const hasPred = !!pred;
  const locked = isComplete;

  const card = document.createElement('div');
  card.className = `match-card${hasPred ? ' has-pred' : ''}${locked ? ' locked' : ''}`;
  card.dataset.matchId = match.id;

  if (locked && pred) {
    const matchResult = match.result1 !== null && match.result2 !== null;
    let pointClass = '';
    if (matchResult) {
      if (pred.pred1 === match.result1 && pred.pred2 === match.result2) pointClass = 'pred-correct';
      else {
        const mw = match.result1 > match.result2 ? 1 : match.result1 < match.result2 ? 2 : 0;
        const pw = pred.pred1 > pred.pred2 ? 1 : pred.pred1 < pred.pred2 ? 2 : 0;
        pointClass = mw === pw ? 'pred-winner' : 'pred-wrong';
      }
    }
    card.innerHTML = `
      <div class="team-name team-left">${escHtml(match.team1)}</div>
      <div class="score-inputs">
        <span class="pred-score ${pointClass}">${pred.pred1} - ${pred.pred2}</span>
      </div>
      <div class="team-name team-right">${escHtml(match.team2)}</div>
    `;
  } else {
    card.innerHTML = `
      <div class="team-name team-left">${escHtml(match.team1)}</div>
      <div class="score-inputs">
        <input type="number" min="0" max="99" value="${pred ? pred.pred1 : ''}" placeholder="0"
          onchange="updatePred(${match.id}, 'pred1', this.value)"
          oninput="updatePred(${match.id}, 'pred1', this.value)" />
        <span class="score-sep">-</span>
        <input type="number" min="0" max="99" value="${pred ? pred.pred2 : ''}" placeholder="0"
          onchange="updatePred(${match.id}, 'pred2', this.value)"
          oninput="updatePred(${match.id}, 'pred2', this.value)" />
      </div>
      <div class="team-name team-right">${escHtml(match.team2)}</div>
    `;
  }
  return card;
}

function updatePred(matchId, field, value) {
  const v = parseInt(value);
  if (isNaN(v) || v < 0) return;
  if (!state.myPredictions[matchId]) state.myPredictions[matchId] = { match_id: matchId };
  state.myPredictions[matchId][field] = v;
  
  const card = document.querySelector(`[data-match-id="${matchId}"]`);
  if (card) {
    const p = state.myPredictions[matchId];
    if (p.pred1 !== undefined && p.pred2 !== undefined) {
      card.classList.add('has-pred');
    }
  }

  // Update button count
  const filled = Object.values(state.myPredictions).filter(p => p.pred1 !== undefined && p.pred2 !== undefined).length;
  const btn = document.querySelector('[onclick="saveAllPredictions()"]');
  if (btn) btn.textContent = `💾 Guardar Quiniela (${filled}/${state.matches.length})`;
}

async function saveAllPredictions() {
  const predictions = [];
  for (const [matchId, pred] of Object.entries(state.myPredictions)) {
    if (pred.pred1 !== undefined && pred.pred2 !== undefined) {
      predictions.push({ match_id: parseInt(matchId), pred1: pred.pred1, pred2: pred.pred2 });
    }
  }

  if (predictions.length < state.matches.length) {
    showToast(`Faltan ${state.matches.length - predictions.length} partidos por completar`, 'error');
    return;
  }

  try {
    const result = await api('POST', '/api/predictions', { predictions });
    await loadMyPredictions();
    showToast('¡Quiniela guardada y bloqueada! 🔒', 'success');
    setTimeout(() => renderApp(), 800);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ─── RESULTADOS ──────────────────────────────────────────────────────────────
function renderResultados(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>⚽ Resultados del Mundial</h1>
      <p>Resultados oficiales de todos los partidos</p>
    </div>
  `;

  const phases = ['Grupos', 'Octavos', 'Cuartos', 'Semis', 'Tercer Lugar', 'Final'];
  const phaseIcons = { 'Grupos': '🌍', 'Octavos': '⚡', 'Cuartos': '🔥', 'Semis': '💥', 'Tercer Lugar': '🥉', 'Final': '🏆' };

  for (const phase of phases) {
    const phaseMatches = state.matches.filter(m => m.phase === phase);
    if (phaseMatches.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'phase-section';
    section.innerHTML = `<div class="phase-title">${phaseIcons[phase]||'⚽'} ${phase}</div>`;

    if (phase === 'Grupos') {
      const groups = {};
      for (const m of phaseMatches) {
        if (!groups[m.group_name]) groups[m.group_name] = [];
        groups[m.group_name].push(m);
      }
      for (const [g, gMatches] of Object.entries(groups).sort()) {
        const gs = document.createElement('div');
        gs.className = 'group-section';
        gs.innerHTML = `<div class="group-label">Grupo ${g}</div>`;
        const grid = document.createElement('div');
        grid.className = 'matches-grid';
        for (const m of gMatches) grid.appendChild(buildResultCard(m));
        gs.appendChild(grid);
        section.appendChild(gs);
      }
    } else {
      const grid = document.createElement('div');
      grid.className = 'matches-grid';
      for (const m of phaseMatches) grid.appendChild(buildResultCard(m));
      section.appendChild(grid);
    }
    container.appendChild(section);
  }
}

function buildResultCard(match) {
  const hasResult = match.result1 !== null && match.result2 !== null;
  const card = document.createElement('div');
  card.className = 'match-card';
  
  if (hasResult) {
    const w1 = match.result1 > match.result2;
    const w2 = match.result2 > match.result1;
    card.innerHTML = `
      <div class="team-name team-left" style="${w1?'color:var(--green)':''}">${escHtml(match.team1)}</div>
      <div class="score-inputs">
        <span class="match-result-badge">
          <span style="${w1?'color:var(--green)':'color:var(--text)'}">${match.result1}</span>
          <span style="color:var(--text-muted); font-size:1rem">-</span>
          <span style="${w2?'color:var(--green)':'color:var(--text)'}">${match.result2}</span>
        </span>
      </div>
      <div class="team-name team-right" style="${w2?'color:var(--green)':''}">${escHtml(match.team2)}</div>
    `;
  } else {
    card.innerHTML = `
      <div class="team-name team-left">${escHtml(match.team1)}</div>
      <div class="score-inputs"><span style="color:var(--text-muted); font-size:0.85rem">Pendiente</span></div>
      <div class="team-name team-right">${escHtml(match.team2)}</div>
    `;
  }
  return card;
}

// ─── ADMIN ───────────────────────────────────────────────────────────────────
function renderAdmin(container) {
  container.innerHTML = `
    <div class="page-header"><h1>⚙️ Panel de Administración</h1></div>
    <div class="admin-tabs">
      <button class="admin-tab ${state.adminTab==='users'?'active':''}" onclick="setAdminTab('users')">👥 Usuarios</button>
      <button class="admin-tab ${state.adminTab==='results'?'active':''}" onclick="setAdminTab('results')">⚽ Resultados</button>
    </div>
    <div id="admin-content"></div>
  `;

  renderAdminContent();
}

function setAdminTab(tab) {
  state.adminTab = tab;
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(t => t.classList.toggle('active', t.textContent.includes(tab === 'users' ? 'Usuarios' : 'Resultados')));
  renderAdminContent();
}

async function renderAdminContent() {
  const container = document.getElementById('admin-content');
  if (!container) return;
  if (state.adminTab === 'users') await renderAdminUsers(container);
  else await renderAdminResults(container);
}

async function renderAdminUsers(container) {
  container.innerHTML = `<p style="color:var(--text-muted)">Cargando...</p>`;
  const users = await api('GET', '/api/admin/users');

  container.innerHTML = `
    <div class="card" style="margin-bottom: 1.5rem;">
      <h3 style="margin-bottom: 1.25rem; font-size: 1rem; font-weight: 600;">Crear nuevo usuario</h3>
      <div class="form-row">
        <div class="form-group">
          <label>Nombre completo</label>
          <input type="text" id="new-name" placeholder="Ej: Juan Pérez" />
        </div>
        <div class="form-group">
          <label>Usuario</label>
          <input type="text" id="new-user" placeholder="juanperez" />
        </div>
        <div class="form-group">
          <label>Contraseña</label>
          <input type="text" id="new-pass" placeholder="Contraseña temporal" />
        </div>
        <div class="form-group" style="flex: 0;">
          <label>&nbsp;</label>
          <button class="btn btn-primary" onclick="createUser()">➕ Crear</button>
        </div>
      </div>
      <div id="user-create-msg"></div>
    </div>

    <div class="card" style="padding: 0; overflow: hidden;">
      ${users.length === 0 ? `<div class="empty-state"><div class="icon">👥</div><h3>Sin usuarios</h3><p>Crea el primer usuario arriba.</p></div>` : `
        <table class="users-table">
          <thead><tr>
            <th>Nombre</th><th>Usuario</th><th>Fecha</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td><strong>${escHtml(u.display_name)}</strong></td>
                <td style="color:var(--text-muted)">${escHtml(u.username)}</td>
                <td style="color:var(--text-muted); font-size:0.85rem">${new Date(u.created_at).toLocaleDateString('es')}</td>
                <td style="display:flex; gap:8px;">
                  <button class="btn btn-secondary btn-sm" onclick="resetPassword(${u.id}, '${escHtml(u.display_name)}')">🔑 Contraseña</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id}, '${escHtml(u.display_name)}')">🗑️ Eliminar</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

async function createUser() {
  const name = document.getElementById('new-name').value.trim();
  const user = document.getElementById('new-user').value.trim();
  const pass = document.getElementById('new-pass').value.trim();
  const msg = document.getElementById('user-create-msg');

  if (!name || !user || !pass) {
    msg.innerHTML = `<div class="alert alert-error" style="margin-top:1rem">Completa todos los campos</div>`;
    return;
  }

  try {
    await api('POST', '/api/admin/users', { username: user, password: pass, displayName: name });
    msg.innerHTML = `<div class="alert alert-success" style="margin-top:1rem">✅ Usuario <strong>${escHtml(name)}</strong> creado correctamente</div>`;
    document.getElementById('new-name').value = '';
    document.getElementById('new-user').value = '';
    document.getElementById('new-pass').value = '';
    await renderAdminContent();
  } catch (e) {
    msg.innerHTML = `<div class="alert alert-error" style="margin-top:1rem">${escHtml(e.message)}</div>`;
  }
}

async function deleteUser(id, name) {
  if (!confirm(`¿Eliminar a "${name}" y todas sus predicciones?`)) return;
  try {
    await api('DELETE', `/api/admin/users/${id}`);
    showToast(`Usuario ${name} eliminado`, 'success');
    await renderAdminContent();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function resetPassword(id, name) {
  const newPass = prompt(`Nueva contraseña para ${name}:`);
  if (!newPass) return;
  try {
    await api('PUT', `/api/admin/users/${id}/password`, { password: newPass });
    showToast(`Contraseña de ${name} actualizada`, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function renderAdminResults(container) {
  container.innerHTML = `<p style="color:var(--text-muted)">Cargando...</p>`;
  await loadMatches();

  const phases = ['Grupos', 'Octavos', 'Cuartos', 'Semis', 'Tercer Lugar', 'Final'];
  const phaseIcons = { 'Grupos': '🌍', 'Octavos': '⚡', 'Cuartos': '🔥', 'Semis': '💥', 'Tercer Lugar': '🥉', 'Final': '🏆' };

  container.innerHTML = `
    <div class="alert alert-info">Ingresa los resultados reales del Mundial. El ranking se actualiza automáticamente.</div>
  `;

  for (const phase of phases) {
    const phaseMatches = state.matches.filter(m => m.phase === phase);
    if (phaseMatches.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'phase-section';
    section.innerHTML = `<div class="phase-title">${phaseIcons[phase]||'⚽'} ${phase}</div>`;

    const grid = document.createElement('div');
    grid.className = 'matches-grid';

    for (const m of phaseMatches) {
      const hasResult = m.result1 !== null && m.result2 !== null;
      const card = document.createElement('div');
      card.className = 'match-card' + (hasResult ? ' has-pred' : '');
      card.id = `admin-match-${m.id}`;

      card.innerHTML = `
        <div style="grid-column: 1/-1; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <div class="result-form" style="flex:1; display: flex; align-items: center; gap: 10px;">
            <input type="text" class="team-input" id="t1-${m.id}" value="${escHtml(m.team1)}" placeholder="Equipo 1" style="width:140px" />
            <input type="number" min="0" max="99" id="r1-${m.id}" value="${hasResult ? m.result1 : ''}" placeholder="0" />
            <span class="score-sep">-</span>
            <input type="number" min="0" max="99" id="r2-${m.id}" value="${hasResult ? m.result2 : ''}" placeholder="0" />
            <input type="text" class="team-input" id="t2-${m.id}" value="${escHtml(m.team2)}" placeholder="Equipo 2" style="width:140px" />
            <button class="btn btn-primary btn-sm" onclick="saveResult(${m.id})">Guardar</button>
            ${hasResult ? `<button class="btn btn-secondary btn-sm" onclick="clearResult(${m.id})">✕ Limpiar</button>` : ''}
          </div>
          ${hasResult ? `<span class="badge badge-green">✓ Registrado</span>` : `<span class="badge badge-muted">Pendiente</span>`}
        </div>
      `;
      grid.appendChild(card);
    }
    section.appendChild(grid);
    container.appendChild(section);
  }
}

async function saveResult(matchId) {
  const r1 = document.getElementById(`r1-${matchId}`).value;
  const r2 = document.getElementById(`r2-${matchId}`).value;
  const t1 = document.getElementById(`t1-${matchId}`).value.trim();
  const t2 = document.getElementById(`t2-${matchId}`).value.trim();

  if (r1 === '' || r2 === '') { showToast('Ingresa ambos resultados', 'error'); return; }

  try {
    await api('PUT', `/api/admin/matches/${matchId}/result`, {
      result1: parseInt(r1), result2: parseInt(r2),
      team1: t1, team2: t2
    });
    await loadMatches();
    showToast('Resultado guardado ✅', 'success');
    await renderAdminContent();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function clearResult(matchId) {
  if (!confirm('¿Limpiar este resultado?')) return;
  try {
    await api('DELETE', `/api/admin/matches/${matchId}/result`);
    await loadMatches();
    showToast('Resultado eliminado', 'success');
    await renderAdminContent();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'toast';
  t.style.cssText = `
    position: fixed; bottom: 2rem; right: 2rem; z-index: 999;
    background: ${type === 'success' ? 'var(--green)' : type === 'error' ? 'var(--red)' : 'var(--gold)'};
    color: ${type === 'success' || type === 'error' ? '#fff' : '#000'};
    padding: 12px 20px; border-radius: 10px;
    font-weight: 600; font-size: 0.9rem;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    animation: slideIn 0.2s ease;
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = '@keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }';
  document.head.appendChild(styleEl);
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── START ───────────────────────────────────────────────────────────────────
init();