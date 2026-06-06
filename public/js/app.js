// ════════════════════════════════════════════════════════════════════════════
// QUINIELA DHL · MUNDIAL 2026 — Frontend SPA
// ════════════════════════════════════════════════════════════════════════════
const S = {
  user: null, meta: null,
  pred: { scores: {}, bracketPicks: {}, submitted: 0 },
  page: 'ranking', subtab: 'grupos', koRound: 'R32',
};
const GROUP_ORDER = ['A','B','C','D','E','F','G','H','I','J','K','L'];
const KO_ROUND_SEQ = ['R32','R16','QF','SF','THIRD','FINAL'];

async function api(method, path, body) {
  const res = await fetch(path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const tn = code => S.meta.teams[code]?.name || code;
const fl = code => S.meta.teams[code]?.flag || '🏴';

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  S.meta = await api('GET', '/api/meta');
  try { S.user = await api('GET', '/api/me'); } catch { S.user = null; }
  if (!S.user) return renderLogin();
  if (!S.user.isAdmin) S.pred = await api('GET', '/api/prediction');
  S.page = 'ranking';
  render();
}

function go(page) { S.page = page; render(); }

// ─── SHELL ──────────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.appendChild(nav());
  const main = document.createElement('main');
  app.appendChild(main);
  ({ ranking: renderRanking, quiniela: renderQuiniela, resultados: renderResultados, admin: renderAdmin }[S.page] || renderRanking)(main);
  const foot = document.createElement('footer');
  foot.className = 'app-footer';
  foot.innerHTML = `Hecho por <strong>Juan C. Martin</strong> · IT · © ${new Date().getFullYear()}`;
  app.appendChild(foot);
}

function nav() {
  const n = document.createElement('div');
  const link = (id, label) => `<button class="nav-link ${S.page===id?'active':''}" onclick="go('${id}')">${label}</button>`;
  n.innerHTML = `
  <div class="dhl-stripe"></div>
  <nav><div class="nav-inner">
    <div class="brand"><span class="brand-logo">DHL</span><span class="brand-sub">Quiniela Mundial 2026</span></div>
    <div class="nav-links" id="mainNav">
      ${link('ranking','🏆 Ranking')}
      ${!S.user.isAdmin ? link('quiniela','📋 Mi Quiniela') : ''}
      ${link('resultados','⚽ Resultados')}
      ${S.user.isAdmin ? link('admin','⚙️ Admin') : ''}
    </div>
    <div class="nav-right">
      <span class="nav-user">${esc(S.user.displayName)}</span>
      <button class="btn-logout" onclick="logout()">Salir</button>
    </div>
  </div></nav>`;
  return n;
}
async function logout(){ await api('POST','/api/logout'); S.user=null; renderLogin(); }

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function renderLogin() {
  document.getElementById('app').innerHTML = `
  <div class="login-wrap"><div class="login-card">
    <div class="login-head">
      <div class="kicker">DHL Express · Mundial 2026</div>
      <h1>QUINIELA</h1>
    </div>
    <div class="login-body">
      <div id="lerr"></div>
      <div class="field"><label>Usuario</label><input type="text" id="lu" autocomplete="username" placeholder="tu usuario"></div>
      <div class="field"><label>Contraseña</label><input type="password" id="lp" autocomplete="current-password" placeholder="••••••••"></div>
      <button class="btn btn-primary btn-full" onclick="doLogin()">Ingresar</button>
    </div>
    <div class="login-credit">Hecho por <strong>Juan C. Martin</strong> · IT</div>
  </div></div>`;
  const p = document.getElementById('lp');
  p.addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });
}
async function doLogin() {
  const username = document.getElementById('lu').value;
  const password = document.getElementById('lp').value;
  try {
    S.user = await api('POST','/api/login',{username,password});
    if (!S.user.isAdmin) S.pred = await api('GET','/api/prediction');
    S.page='ranking'; render();
  } catch(e){ document.getElementById('lerr').innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; }
}

// ─── RANKING ──────────────────────────────────────────────────────────────────
let RANK = { rows: [], canView: false };
async function renderRanking(main) {
  main.innerHTML = `<div class="page-head"><div><h1>Tabla de Posiciones</h1><div class="sub">Se actualiza con cada resultado que registra el admin</div></div></div><div id="rk">Cargando…</div>`;
  try {
    const d = await api('GET','/api/ranking');
    const r = d.ranking;
    RANK.rows = r;
    RANK.canView = d.viewerIsAdmin || !!d.meSubmitted;
    let html = `<div class="stats">
      <div class="stat accent"><div class="lbl">Participantes</div><div class="val">${r.length}</div></div>
      <div class="stat"><div class="lbl">Partidos jugados</div><div class="val">${d.playedMatches}<span style="font-size:1rem;color:var(--muted)">/${d.totalMatches}</span></div></div>
      <div class="stat"><div class="lbl">Líder</div><div class="val" style="font-size:1.2rem">${r[0]?esc(r[0].displayName):'—'}</div></div>
      <div class="stat"><div class="lbl">Fase grupos</div><div class="val" style="font-size:1.1rem">${d.groupStageComplete?'Completa':'En curso'}</div></div>
    </div>`;

    if (!RANK.canView) {
      html += `<div class="banner banner-info"><span class="ico">🔒</span><div>Para ver la quiniela de los demás participantes, primero <b>envía tu propia quiniela</b> (grupos + cuadro).</div></div>`;
    }

    if (!r.length) {
      html += `<div class="card card-pad"><div class="empty"><div class="ico">👥</div><h3>Sin participantes todavía</h3><p>El admin debe crear los usuarios.</p></div></div>`;
    } else {
      // Tabla (escritorio)
      html += `<div class="card rank-card"><table class="rank-table"><thead><tr>
        <th>#</th><th>Participante</th><th class="num">Total</th><th class="num">Grupos</th><th class="num">Elim.</th>
        <th class="num">Exactos</th><th class="num">Result.</th><th>Estado</th><th></th>
      </tr></thead><tbody>`;
      r.forEach((u,i) => {
        const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
        const ko = (u.koPoints||0) + (u.championBonus||0);
        const viewBtn = RANK.canView
          ? `<button class="btn btn-ghost btn-xs" onclick="viewParticipant(${u.userId})">Ver</button>`
          : `<button class="btn btn-ghost btn-xs" disabled title="Envía tu quiniela primero">Ver</button>`;
        html += `<tr>
          <td class="pos p${i+1}">${medal||(i+1)}</td>
          <td class="name">${esc(u.displayName)} ${u.championHit?'🏆':''}</td>
          <td class="num"><span class="pts">${u.total}</span></td>
          <td class="num">${u.groupPoints}</td>
          <td class="num">${ko>0?`<span class="chip chip-green">${ko}</span>`:`<span class="chip chip-gray">—</span>`}</td>
          <td class="num"><span class="chip chip-yellow">✓ ${u.exactCount}</span></td>
          <td class="num"><span class="chip chip-blue">${u.correctResultCount}</span></td>
          <td>${u.submitted?`<span class="chip chip-green">Enviada</span>`:`<span class="chip chip-red">Pendiente</span>`}</td>
          <td class="num">${viewBtn}</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;

      // Tarjetas (móvil)
      html += `<div class="rank-cards">`;
      r.forEach((u,i) => {
        const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`;
        const ko = (u.koPoints||0) + (u.championBonus||0);
        const viewBtn = RANK.canView
          ? `<button class="btn btn-ghost btn-xs" onclick="viewParticipant(${u.userId})">Ver quiniela</button>`
          : `<button class="btn btn-ghost btn-xs" disabled>🔒 Ver</button>`;
        html += `<div class="rc">
          <div class="rc-top">
            <div class="rc-pos">${medal}</div>
            <div class="rc-name">${esc(u.displayName)} ${u.championHit?'🏆':''}<div class="rc-state">${u.submitted?'<span class="chip chip-green">Enviada</span>':'<span class="chip chip-red">Pendiente</span>'}</div></div>
            <div class="rc-total"><span class="pts">${u.total}</span><span class="rc-tlbl">pts</span></div>
          </div>
          <div class="rc-grid">
            <div><span>Grupos</span><b>${u.groupPoints}</b></div>
            <div><span>Elim.</span><b>${ko||'—'}</b></div>
            <div><span>Exactos</span><b>${u.exactCount}</b></div>
            <div><span>Result.</span><b>${u.correctResultCount}</b></div>
          </div>
          <div class="rc-foot">${viewBtn}</div>
        </div>`;
      });
      html += `</div>`;

      html += `<p class="bracket-note" style="margin-top:.9rem"><b>Grupos:</b> 5 exacto · 2 resultado (ganador correcto sin marcador) · 0 fallo. <b>Eliminatorias</b> (por equipo que acertaste que avanza): 16avos 4 · octavos 4 · cuartos 4 · semis 6 · final 6 · <b>campeón +15</b>. Desempate: más marcadores exactos.</p>`;
    }
    document.getElementById('rk').innerHTML = html;
  } catch(e){ document.getElementById('rk').innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; }
}

// ─── MI QUINIELA ───────────────────────────────────────────────────────────────
function filledCount(){ return S.meta.matches.filter(m=>{const s=S.pred.scores[m.key];return s&&Number.isInteger(s.a)&&Number.isInteger(s.b);}).length; }

// ─── VER QUINIELA DE UN PARTICIPANTE (modal) ──────────────────────────────────
async function viewParticipant(id) {
  let ov = document.getElementById('pv-overlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id='pv-overlay'; ov.className='pv-overlay';
    ov.addEventListener('click', e => { if (e.target===ov) closeParticipant(); });
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div class="pv-modal"><div class="pv-loading">Cargando quiniela…</div></div>`;
  ov.classList.add('open');
  try {
    const d = await api('GET', `/api/participant/${id}`);
    PV = d; PV.tab = 'grupos';
    drawParticipant();
  } catch(e) {
    ov.querySelector('.pv-modal').innerHTML = `<div class="pv-head"><h2>No disponible</h2><button class="pv-x" onclick="closeParticipant()">✕</button></div><div class="pv-body"><div class="alert alert-error">${esc(e.message)}</div></div>`;
  }
}
function closeParticipant(){ const ov=document.getElementById('pv-overlay'); if(ov) ov.classList.remove('open'); }
let PV = null;
function setPvTab(t){ PV.tab=t; drawParticipant(); }

function drawParticipant() {
  const ov = document.getElementById('pv-overlay'); if(!ov) return;
  const s = PV.score || {};
  const ko = (s.koPoints||0)+(s.championBonus||0);
  const head = `<div class="pv-head">
      <div><div class="pv-kick">Quiniela de</div><h2>${esc(PV.displayName)} ${s.championHit?'🏆':''}</h2></div>
      <button class="pv-x" onclick="closeParticipant()">✕</button>
    </div>
    <div class="pv-score">
      <div class="pvs"><span>${s.total||0}</span><small>Total</small></div>
      <div class="pvs"><span>${s.groupPoints||0}</span><small>Grupos</small></div>
      <div class="pvs"><span>${ko||0}</span><small>Elim.</small></div>
      <div class="pvs"><span>${s.exactCount||0}</span><small>Exactos</small></div>
      <div class="pvs"><span>${s.correctResultCount||0}</span><small>Result.</small></div>
    </div>
    <div class="pv-tabs">
      <button class="pv-tab ${PV.tab==='grupos'?'active':''}" onclick="setPvTab('grupos')">⚽ Grupos</button>
      <button class="pv-tab ${PV.tab==='bracket'?'active':''}" onclick="setPvTab('bracket')">🗺️ Cuadro</button>
    </div>`;
  const body = PV.tab==='grupos' ? pvGroupsHTML() : pvBracketHTML();
  ov.querySelector('.pv-modal').innerHTML = head + `<div class="pv-body">${PV.submitted?'':'<div class="banner banner-info" style="margin-bottom:1rem"><span class="ico">✏️</span><div>Esta quiniela aún es un borrador (no enviada).</div></div>'}${body}</div>`;
}

function pvGroupsHTML() {
  let html = `<div class="pv-groups">`;
  for (const g of GROUP_ORDER) {
    const gms = S.meta.matches.filter(m=>m.group===g);
    html += `<div class="pv-gblock"><div class="group-title" style="margin-bottom:.4rem"><span class="group-badge">${g}</span><span class="gname">Grupo ${g}</span></div>`;
    for (const m of gms) {
      const sc = PV.scores[m.key]; const has = sc && Number.isInteger(sc.a)&&Number.isInteger(sc.b);
      html += `<div class="pv-match">
        <span class="pvm-t r">${esc(tn(m.team1))} ${fl(m.team1)}</span>
        <span class="pvm-s">${has?`${sc.a}-${sc.b}`:'—'}</span>
        <span class="pvm-t">${fl(m.team2)} ${esc(tn(m.team2))}</span>
      </div>`;
    }
    html += `</div>`;
  }
  return html + `</div>`;
}

function pvBracketHTML() {
  const B = S.meta.bracket;
  const champ = PV.picks[104];
  const cols = SEQ.map(round => {
    const ties = B.rounds[round].map(id => {
      const m = PV.matches[id]; const pick = PV.picks[id];
      const seat = (team) => {
        if (!team) return `<div class="seat tbd"><span class="seat-flag">·</span><span class="seat-nm">Por definir</span></div>`;
        const sel = pick === team;
        return `<div class="seat ${sel?'win':''}"><span class="seat-flag">${fl(team)}</span><span class="seat-nm">${esc(tn(team))}</span></div>`;
      };
      return `<div class="br-tie">${seat(m?m.team1:null)}${seat(m?m.team2:null)}</div>`;
    }).join('');
    return `<div class="br-col br-${round}"><div class="br-col-label">${B.roundLabel[round]}</div><div class="br-col-body">${ties}</div></div>`;
  }).join('');
  let html = `<div class="bracket-scroll"><div class="bracket-tree">${cols}</div></div>`;
  if (champ) html += `<div class="champ-card" style="margin-top:1rem"><div class="lbl">🏆 Campeón</div><div class="team">${fl(champ)} ${esc(tn(champ))}</div></div>`;
  return html;
}

function renderQuiniela(main) {
  const locked = !!S.pred.submitted;
  const filled = filledCount();
  const pct = Math.round(filled/72*100);
  const bracketDone = bracketIsComplete();
  main.innerHTML = `
    <div class="page-head"><div><h1>Mi Quiniela</h1><div class="sub">1) Predice los 72 partidos de grupos · 2) Arma tu cuadro eliminatorio</div></div></div>
    ${locked ? `<div class="banner banner-ok"><span class="ico">🔒</span><div><strong>Quiniela enviada y bloqueada.</strong> Ya no puedes modificarla.</div></div>`
             : `<div class="progress"><div class="row"><span>Grupos</span><span>${filled}/72</span></div><div class="bar"><div style="width:${pct}%"></div></div></div>
                <div class="banner banner-info"><span class="ico">⚠️</span><div>Para enviar necesitas completar los <b>72 partidos</b> y tu <b>cuadro eliminatorio</b> (pestaña "Mi cuadro"). Al enviar queda <b>bloqueada</b>.</div></div>`}
    <div class="subtabs">
      <button class="subtab ${S.subtab==='grupos'?'active':''}" onclick="setSub('grupos')">⚽ Partidos ${filled===72?'✓':''}</button>
      <button class="subtab ${S.subtab==='tablas'?'active':''}" onclick="setSub('tablas')">📊 Mis tablas</button>
      <button class="subtab ${S.subtab==='bracket'?'active':''}" onclick="setSub('bracket')">🗺️ Mi cuadro ${bracketDone?'✓':''}</button>
    </div>
    <div id="qbody"></div>`;
  renderSub();
}
function setSub(t){ S.subtab=t; renderSub(); }
function renderSub() {
  const body = document.getElementById('qbody'); if(!body) return;
  if (S.subtab==='grupos') return renderMatches(body);
  if (S.subtab==='tablas') return renderMyTables(body);
  if (S.subtab==='bracket') return renderMyBracket(body);
}

function bracketIsComplete() {
  const req = [...S.meta.bracket.rounds.R32, ...S.meta.bracket.rounds.R16, ...S.meta.bracket.rounds.QF, ...S.meta.bracket.rounds.SF, ...S.meta.bracket.rounds.FINAL];
  return req.every(id => !!S.pred.bracketPicks[id]);
}

function renderMatches(body) {
  const locked = !!S.pred.submitted;
  body.innerHTML = '';
  for (const g of GROUP_ORDER) {
    const gms = S.meta.matches.filter(m=>m.group===g);
    const block = document.createElement('div'); block.className='group-block';
    block.innerHTML = `<div class="group-title"><span class="group-badge">${g}</span><span class="gname">Grupo ${g}</span></div>`;
    const list = document.createElement('div'); list.className='match-list';
    for (const m of gms) list.appendChild(matchRow(m, locked));
    block.appendChild(list); body.appendChild(block);
  }
  if (!locked) {
    const sb = document.createElement('div'); sb.className='savebar';
    sb.innerHTML = `<div class="inner">
      <span class="count">Grupos <b id="cnt">${filledCount()}</b>/72</span>
      <button class="btn btn-ghost btn-sm" onclick="saveDraft()">Guardar</button>
      <button class="btn btn-yellow btn-sm" onclick="setSub('bracket')">Siguiente: mi cuadro →</button>
    </div>`;
    body.appendChild(sb);
  }
}

function matchRow(m, locked) {
  const s = S.pred.scores[m.key] || {};
  const filled = Number.isInteger(s.a) && Number.isInteger(s.b);
  const row = document.createElement('div');
  row.className = `match ${filled?'filled':''} ${locked?'locked':''}`;
  const left = `<div class="team left"><span class="tn">${esc(tn(m.team1))}</span><span class="flag">${fl(m.team1)}</span></div>`;
  const right = `<div class="team right"><span class="flag">${fl(m.team2)}</span><span class="tn">${esc(tn(m.team2))}</span></div>`;
  const mid = locked
    ? `<div class="score-static">${filled?`${s.a} - ${s.b}`:'—'}</div>`
    : `<div class="score-in">
         <input type="number" min="0" max="49" inputmode="numeric" value="${filled?s.a:''}" data-k="${m.key}" data-s="a">
         <span class="score-sep">–</span>
         <input type="number" min="0" max="49" inputmode="numeric" value="${filled?s.b:''}" data-k="${m.key}" data-s="b">
       </div>`;
  row.innerHTML = left + mid + right;
  if (!locked) row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', onScoreInput));
  return row;
}
function onScoreInput(e) {
  const k = e.target.dataset.k, side = e.target.dataset.s;
  let v = e.target.value === '' ? null : Math.max(0, Math.min(49, parseInt(e.target.value)));
  if (!S.pred.scores[k]) S.pred.scores[k] = {};
  S.pred.scores[k][side] = (v===null||isNaN(v)) ? null : v;
  const s = S.pred.scores[k];
  const row = e.target.closest('.match');
  if (row) row.classList.toggle('filled', Number.isInteger(s.a)&&Number.isInteger(s.b));
  const cnt = document.getElementById('cnt'); if (cnt) cnt.textContent = filledCount();
  // Cambiar grupos invalida el bracket previo (los equipos pueden cambiar)
  if (Object.keys(S.pred.bracketPicks).length) S.pred.bracketPicks = {};
}

async function saveDraft() {
  try { await api('PUT','/api/prediction',{scores:S.pred.scores,bracketPicks:S.pred.bracketPicks}); toast('Guardado'); }
  catch(e){ toast(e.message,'err'); }
}

async function submitQuiniela() {
  if (filledCount() < 72) { toast(`Faltan ${72-filledCount()} partidos de grupos`, 'err'); setSub('grupos'); return; }
  if (!bracketIsComplete()) { toast('Completa tu cuadro eliminatorio', 'err'); setSub('bracket'); return; }
  if (!confirm('¿Enviar tu quiniela completa (grupos + cuadro)? Quedará BLOQUEADA.')) return;
  clearTimeout(saveTimer); savePending = false; // evitar guardado duplicado en segundo plano
  try {
    await api('PUT','/api/prediction',{scores:S.pred.scores,bracketPicks:S.pred.bracketPicks});
    await api('POST','/api/prediction/submit',{scores:S.pred.scores,bracketPicks:S.pred.bracketPicks});
    S.pred.submitted = 1;
    toast('¡Quiniela enviada! 🔒'); render();
  } catch(e){ toast(e.message,'err'); }
}

// ─── MIS TABLAS ────────────────────────────────────────────────────────────────
async function renderMyTables(body) {
  body.innerHTML = `<div class="bracket-note">Tablas calculadas con tus predicciones (puntos → dif. de gol → goles a favor → enfrentamiento directo). <span class="tag tag-q">CLASIFICA</span> 1° y 2° · <span class="tag tag-3">3°</span> puede entrar como mejor tercero.</div><div id="tabs-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem"></div>`;
  let d;
  try { d = await api('GET','/api/prediction/bracket'); } catch(e){ body.innerHTML=`<div class="alert alert-error">${esc(e.message)}</div>`; return; }
  const grid = document.getElementById('tabs-grid');
  const qualThirds = new Set(d.qualifiedThirds);
  for (const g of GROUP_ORDER) {
    const tbl = d.allTables[g];
    const card = document.createElement('div'); card.className='card card-pad';
    let rows = tbl.map((t,i) => {
      const cls = i===0?'qual-1':i===1?'qual-2':i===2?(qualThirds.has(t.team)?'qual-3':'qual-out'):'qual-out';
      let badge = i<2?`<span class="tag tag-q">Clasifica</span>`: i===2?(qualThirds.has(t.team)?`<span class="tag tag-q">Mejor 3°</span>`:`<span class="tag tag-3">3°</span>`):'';
      return `<tr class="${cls}"><td>${fl(t.team)} <b>${esc(tn(t.team))}</b> ${badge}</td><td class="num">${t.pts}</td><td class="num">${t.dg>0?'+':''}${t.dg}</td><td class="num">${t.gf}</td></tr>`;
    }).join('');
    card.innerHTML = `<div class="group-title" style="margin-bottom:.5rem"><span class="group-badge">${g}</span><span class="gname">Grupo ${g}</span></div>
      <table class="mini-table"><thead><tr><th>Equipo</th><th class="num">Pts</th><th class="num">DG</th><th class="num">GF</th></tr></thead><tbody>${rows}</tbody></table>`;
    grid.appendChild(card);
  }
}

// ─── MOTOR DE BRACKET EN EL CLIENTE ───────────────────────────────────────────
// Réplica de la lógica del servidor: arma el cuadro desde standings + picks,
// instantáneamente y sin llamadas de red. El guardado va en segundo plano.

// Asigna los 8 mejores terceros a las 8 llaves evitando repetir grupo (backtracking).
function clientAssignThirds(qualifiedThirds) {
  const B = S.meta.bracket;
  const slots = B.thirdSlotOrder;
  const used = new Array(qualifiedThirds.length).fill(false);
  const result = {};
  function bt(i) {
    if (i === slots.length) return true;
    const wGroup = B.thirdSlotWinnerGroup[slots[i]];
    for (let k = 0; k < qualifiedThirds.length; k++) {
      if (used[k]) continue;
      if (B.teamGroup[qualifiedThirds[k]] === wGroup) continue;
      used[k] = true; result[slots[i]] = qualifiedThirds[k];
      if (bt(i + 1)) return true;
      used[k] = false; delete result[slots[i]];
    }
    return false;
  }
  if (!bt(0)) slots.forEach((s, i) => { result[s] = qualifiedThirds[i] || null; });
  return result;
}

// Construye matches {id:{team1,team2}} desde standings + picks (igual que el server).
function clientBuildBracket(standings, qualifiedThirds, picks) {
  const B = S.meta.bracket;
  const thirdAssign = clientAssignThirds(qualifiedThirds || []);
  const matches = {};
  const resolveSlot = (slot, slotId) => {
    if (slot === 'T') return thirdAssign[slotId] || null;
    const pos = slot[0], g = slot[1];
    if (pos === '1') return standings.winners[g] || null;
    if (pos === '2') return standings.runners[g] || null;
    return null;
  };
  for (const id of B.rounds.R32) {
    const [s1, s2] = B.r32[id];
    matches[id] = { team1: resolveSlot(s1, id), team2: resolveSlot(s2, id) };
  }
  const later = [...B.rounds.R16, ...B.rounds.QF, ...B.rounds.SF, ...B.rounds.THIRD, ...B.rounds.FINAL];
  const resolveFeed = (token) => {
    const kind = token[0], id = parseInt(token.slice(1));
    if (kind === 'W') return picks[id] || null;
    if (kind === 'L') {
      const m = matches[id], w = picks[id];
      if (!m || !w || !m.team1 || !m.team2) return null;
      return m.team1 === w ? m.team2 : m.team1;
    }
    return null;
  };
  for (const id of later) {
    const [a, b] = B.feeds[id];
    matches[id] = { team1: resolveFeed(a), team2: resolveFeed(b) };
  }
  return matches;
}

// Elimina picks que ya no correspondan a su llave (tras cambiar un ganador previo).
function clientPrune(standings, qualifiedThirds, picks) {
  const B = S.meta.bracket;
  const order = [...B.rounds.R32, ...B.rounds.R16, ...B.rounds.QF, ...B.rounds.SF, ...B.rounds.THIRD, ...B.rounds.FINAL];
  const clean = {};
  for (const id of order) {
    const m = clientBuildBracket(standings, qualifiedThirds, clean)[id];
    const p = picks[id];
    if (p && m && (p === m.team1 || p === m.team2)) clean[id] = p;
  }
  return clean;
}

// ─── MI CUADRO (árbol pickable) ───────────────────────────────────────────────
let BR = { standings: null, qualifiedThirds: [], matches: {} };

async function renderMyBracket(body) {
  if (filledCount() < 72) {
    body.innerHTML = `<div class="banner banner-info"><span class="ico">📋</span><div>Primero completa los <b>72 partidos de grupos</b>. Tu cuadro se arma automáticamente con esos resultados.</div></div>`;
    return;
  }
  body.innerHTML = `<div id="brwrap" class="muted">Calculando tu cuadro…</div>`;
  // Una sola llamada para obtener standings + terceros (la estructura ya viene en meta)
  const d = await api('GET','/api/prediction/bracket');
  BR.standings = { winners:{}, runners:{} };
  for (const g of GROUP_ORDER){ BR.standings.winners[g]=d.allTables[g][0].team; BR.standings.runners[g]=d.allTables[g][1].team; }
  BR.qualifiedThirds = d.qualifiedThirds;
  // Poda los picks guardados por si los grupos cambiaron, y recalcula
  S.pred.bracketPicks = clientPrune(BR.standings, BR.qualifiedThirds, d.picks || S.pred.bracketPicks || {});
  recomputeBracket();
  drawBracketTree();
}

function recomputeBracket() {
  BR.matches = clientBuildBracket(BR.standings, BR.qualifiedThirds, S.pred.bracketPicks);
}

const SEQ = ['R32','R16','QF','SF','FINAL'];

function drawBracketTree() {
  const wrap = document.getElementById('brwrap'); if(!wrap) return;
  const locked = !!S.pred.submitted;
  const B = S.meta.bracket;
  const totalReq = SEQ.reduce((n,r)=>n+B.rounds[r].length,0);
  const done = SEQ.reduce((n,r)=>n+B.rounds[r].filter(id=>S.pred.bracketPicks[id]).length,0);
  const champ = S.pred.bracketPicks[104];

  let html = `<div class="bracket-note">Elige al ganador de cada llave tocándolo; avanza solo a la siguiente ronda. La colocación de terceros es ilustrativa y <b>no afecta tus puntos</b>.</div>
    <div class="ko-progress">Elecciones: <b id="koDone">${done}</b>/${totalReq} ${champ?`· 🏆 Campeón: <b>${esc(tn(champ))}</b>`:''}</div>
    <div class="bracket-scroll"><div class="bracket-tree" id="tree">${treeHTML(locked)}</div></div>`;
  if (!locked) {
    html += `<div class="savebar"><div class="inner">
      <span class="count">Cuadro <b id="koDone2">${done}</b>/${totalReq}</span>
      <span class="save-state" id="saveState"></span>
      <button class="btn btn-yellow btn-sm" onclick="submitQuiniela()">🔒 Enviar definitiva</button>
    </div></div>`;
  }
  wrap.className = '';
  wrap.innerHTML = html;
}

// Genera las columnas del árbol (16avos → final) con conexiones.
function treeHTML(locked) {
  const B = S.meta.bracket;
  // columnas: R32(16), R16(8), QF(4), SF(2), FINAL(1)
  return SEQ.map(round => {
    const ids = B.rounds[round];
    const ties = ids.map(id => tieHTML(id, round, locked)).join('');
    return `<div class="br-col br-${round}">
      <div class="br-col-label">${B.roundLabel[round]}</div>
      <div class="br-col-body">${ties}</div>
    </div>`;
  }).join('');
}

function tieHTML(id, round, locked) {
  const m = BR.matches[id];
  const pick = S.pred.bracketPicks[id];
  const seat = (team) => {
    if (!team) return `<div class="seat tbd"><span class="seat-flag">·</span><span class="seat-nm">Por definir</span></div>`;
    const sel = pick === team;
    const dis = locked ? 'disabled' : '';
    return `<button class="seat ${sel?'win':''}" ${dis} onclick="pick(${id},'${team}')">
      <span class="seat-flag">${fl(team)}</span><span class="seat-nm">${esc(tn(team))}</span>
    </button>`;
  };
  return `<div class="br-tie" data-id="${id}">${seat(m.team1)}${seat(m.team2)}</div>`;
}

// ── Selección instantánea + guardado en segundo plano ──
function pick(matchId, team) {
  if (!team || S.pred.submitted) return;
  if (S.pred.bracketPicks[matchId] === team) return; // sin cambios
  S.pred.bracketPicks[matchId] = team;
  // Poda aguas abajo y recalcula equipos de rondas siguientes (instantáneo)
  S.pred.bracketPicks = clientPrune(BR.standings, BR.qualifiedThirds, S.pred.bracketPicks);
  recomputeBracket();
  drawBracketTree();         // redibujo inmediato
  scheduleSave();            // guardar sin bloquear
}

// Guardado con "debounce": agrupa cambios rápidos en una sola petición.
let saveTimer = null, savePending = false;
function scheduleSave() {
  savePending = true;
  setSaveState('Guardando…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 700);
}
async function flushSave() {
  if (!savePending) return;
  savePending = false;
  try {
    await api('PUT','/api/prediction',{scores:S.pred.scores, bracketPicks:S.pred.bracketPicks});
    setSaveState('Guardado ✓');
  } catch(e) {
    savePending = true;
    setSaveState('Error al guardar');
  }
}
function setSaveState(txt){ const el=document.getElementById('saveState'); if(el) el.textContent=txt; }

// ─── RESULTADOS (oficiales) ─────────────────────────────────────────────────────
async function renderResultados(main) {
  main.innerHTML = `<div class="page-head"><div><h1>Resultados Oficiales</h1><div class="sub">Marcadores reales de la fase de grupos</div></div></div><div id="rbody">Cargando…</div>`;
  let real = { scores:{}, knockout:{} };
  try { real = await api('GET','/api/results'); } catch {}
  renderResultsView(document.getElementById('rbody'), real.scores || {}, false);
}

function renderResultsView(body, real, editable) {
  body.innerHTML='';
  for (const g of GROUP_ORDER) {
    const gms = S.meta.matches.filter(m=>m.group===g);
    const block=document.createElement('div'); block.className='group-block';
    block.innerHTML=`<div class="group-title"><span class="group-badge">${g}</span><span class="gname">Grupo ${g}</span></div>`;
    const list=document.createElement('div'); list.className='match-list';
    for (const m of gms){
      const s=real[m.key]||{};
      const has=Number.isInteger(s.a)&&Number.isInteger(s.b);
      const row=document.createElement('div'); row.className=`match ${has?'filled':''}`;
      const mid = editable
        ? `<div class="score-in">
             <input type="number" min="0" max="49" value="${has?s.a:''}" data-k="${m.key}" data-s="a">
             <span class="score-sep">–</span>
             <input type="number" min="0" max="49" value="${has?s.b:''}" data-k="${m.key}" data-s="b">
           </div>`
        : `<div class="score-static">${has?`${s.a} - ${s.b}`:'<span style="color:var(--muted);font-size:.8rem">—</span>'}</div>`;
      row.innerHTML=`<div class="team left"><span class="tn">${esc(tn(m.team1))}</span><span class="flag">${fl(m.team1)}</span></div>${mid}<div class="team right"><span class="flag">${fl(m.team2)}</span><span class="tn">${esc(tn(m.team2))}</span></div>`;
      if (editable) row.querySelectorAll('input').forEach(i=>i.addEventListener('input',onResultInput));
      list.appendChild(row);
    }
    block.appendChild(list); body.appendChild(block);
  }
}

// ─── ADMIN ──────────────────────────────────────────────────────────────────────
function renderAdmin(main) {
  main.innerHTML=`<div class="page-head"><div><h1>Panel Admin</h1><div class="sub">Gestiona participantes y registra resultados</div></div></div>
    <div class="subtabs">
      <button class="subtab ${S.subtab==='users'?'active':''}" onclick="setAdminTab('users')">👥 Participantes</button>
      <button class="subtab ${S.subtab==='results'?'active':''}" onclick="setAdminTab('results')">⚽ Resultados grupos</button>
      <button class="subtab ${S.subtab==='ko'?'active':''}" onclick="setAdminTab('ko')">🏆 Eliminatorias</button>
    </div><div id="abody"></div>`;
  if (!['users','results','ko'].includes(S.subtab)) S.subtab='users';
  renderAdminBody();
}
function setAdminTab(t){ S.subtab=t; renderAdmin(document.querySelector('main')); }
function renderAdminBody(){ const b=document.getElementById('abody'); if(!b)return;
  if (S.subtab==='results') adminResults(b);
  else if (S.subtab==='ko') adminKnockout(b);
  else adminUsers(b);
}

async function adminUsers(body) {
  body.innerHTML=`<div class="card card-pad" style="margin-bottom:1.2rem">
    <div style="font-weight:700;margin-bottom:.9rem">Crear participante</div>
    <div class="form-grid">
      <div class="field" style="margin:0"><label>Nombre</label><input type="text" id="nn" placeholder="Juan Pérez"></div>
      <div class="field" style="margin:0"><label>Usuario</label><input type="text" id="nu" placeholder="jperez"></div>
      <div class="field" style="margin:0"><label>Contraseña</label><input type="text" id="np" placeholder="temporal123"></div>
      <button class="btn btn-primary" onclick="createUser()">Crear</button>
    </div><div id="cmsg"></div>
  </div><div id="ulist">Cargando…</div>`;
  await loadUsers();
}
async function loadUsers() {
  const users = await api('GET','/api/admin/users');
  const el = document.getElementById('ulist');
  if (!users.length) { el.innerHTML=`<div class="card card-pad"><div class="empty"><div class="ico">👥</div><h3>Sin participantes</h3></div></div>`; return; }
  el.innerHTML=`<div class="card" style="overflow:hidden"><table class="users-table"><thead><tr>
    <th>Nombre</th><th>Usuario</th><th>Quiniela</th><th>Acciones</th></tr></thead><tbody>
    ${users.map(u=>`<tr>
      <td><b>${esc(u.display_name)}</b></td><td style="color:var(--muted)">${esc(u.username)}</td>
      <td>${u.submitted?`<span class="chip chip-green">Enviada</span>`:`<span class="chip chip-gray">${u.filled}/72</span>`}</td>
      <td><div class="actions">
        <button class="btn btn-ghost btn-sm" onclick="resetPass(${u.id},'${esc(u.display_name)}')">Contraseña</button>
        ${u.submitted?`<button class="btn btn-ghost btn-sm" onclick="unlock(${u.id},'${esc(u.display_name)}')">Desbloquear</button>`:''}
        <button class="btn btn-danger btn-sm" onclick="delUser(${u.id},'${esc(u.display_name)}')">Eliminar</button>
      </div></td></tr>`).join('')}
  </tbody></table></div>`;
}
async function createUser() {
  const displayName=document.getElementById('nn').value.trim();
  const username=document.getElementById('nu').value.trim();
  const password=document.getElementById('np').value.trim();
  const msg=document.getElementById('cmsg');
  if(!displayName||!username||!password){msg.innerHTML=`<div class="alert alert-error" style="margin-top:.9rem">Completa todos los campos</div>`;return;}
  try{ await api('POST','/api/admin/users',{username,password,displayName});
    msg.innerHTML=`<div class="alert alert-ok" style="margin-top:.9rem">✅ ${esc(displayName)} creado</div>`;
    ['nn','nu','np'].forEach(id=>document.getElementById(id).value='');
    await loadUsers();
  }catch(e){ msg.innerHTML=`<div class="alert alert-error" style="margin-top:.9rem">${esc(e.message)}</div>`; }
}
async function delUser(id,name){ if(!confirm(`¿Eliminar a ${name} y su quiniela?`))return; await api('DELETE',`/api/admin/users/${id}`); toast(`${name} eliminado`); await loadUsers(); }
async function resetPass(id,name){ const p=prompt(`Nueva contraseña para ${name}:`); if(!p)return; await api('PUT',`/api/admin/users/${id}/password`,{password:p}); toast('Contraseña actualizada'); }
async function unlock(id,name){ if(!confirm(`¿Desbloquear la quiniela de ${name}? Podrá volver a editarla.`))return; await api('PUT',`/api/admin/users/${id}/unlock`); toast('Quiniela desbloqueada'); await loadUsers(); }

let ADMIN_RESULTS = {};
async function adminResults(body) {
  body.innerHTML=`<div class="banner banner-info"><span class="ico">⚽</span><div>Ingresa los marcadores reales de los 72 partidos. El ranking se actualiza solo. Los puntos por clasificados a 16avos se otorgan cuando estén los 72 partidos.</div></div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:1rem"><button class="btn btn-primary" onclick="saveResults()">💾 Guardar resultados</button></div>
    <div id="resbody"></div>`;
  const real = await api('GET','/api/admin/results');
  ADMIN_RESULTS = real.scores || {};
  renderResultsView(document.getElementById('resbody'), ADMIN_RESULTS, true);
}
function onResultInput(e){
  const k=e.target.dataset.k, side=e.target.dataset.s;
  let v=e.target.value===''?null:Math.max(0,Math.min(49,parseInt(e.target.value)));
  if(!ADMIN_RESULTS[k])ADMIN_RESULTS[k]={};
  ADMIN_RESULTS[k][side]=(v===null||isNaN(v))?null:v;
  const row=e.target.closest('.match'); const s=ADMIN_RESULTS[k];
  if(row)row.classList.toggle('filled',Number.isInteger(s.a)&&Number.isInteger(s.b));
}
async function saveResults(){
  const clean={}; for(const k of Object.keys(ADMIN_RESULTS)){const s=ADMIN_RESULTS[k]; if(s&&Number.isInteger(s.a)&&Number.isInteger(s.b))clean[k]=s;}
  try{ const r=await api('PUT','/api/admin/results',{scores:clean}); toast(`Guardado (${r.count} partidos)`); }
  catch(e){ toast(e.message,'err'); }
}

// ─── ADMIN: eliminatorias reales (qué equipos avanzan por ronda) ──────────────
let KO = { reach8:[], reach4:[], reachSemi:[], reachFinal:[], champion:null };
const KO_STAGES = [
  { key:'reach8',    label:'Octavos (16)',  max:16, from:'qualified' },
  { key:'reach4',    label:'Cuartos (8)',   max:8,  from:'reach8' },
  { key:'reachSemi', label:'Semifinales (4)',max:4, from:'reach4' },
  { key:'reachFinal',label:'Final (2)',     max:2,  from:'reachSemi' },
  { key:'champion',  label:'Campeón (1)',   max:1,  from:'reachFinal', single:true },
];
let KO_QUALIFIED = [];

async function adminKnockout(body) {
  const d = await api('GET','/api/results/bracket');
  if (!d.ready) {
    body.innerHTML = `<div class="banner banner-info"><span class="ico">📋</span><div>Primero completa los <b>72 resultados de grupos</b>. Cuando estén, aquí podrás marcar qué equipos avanzaron en cada ronda real.</div></div>`;
    return;
  }
  // pool de clasificados (1°,2° y mejores terceros) desde tablas reales
  KO_QUALIFIED = [];
  for (const g of GROUP_ORDER){ KO_QUALIFIED.push(d.allTables[g][0].team, d.allTables[g][1].team); }
  KO_QUALIFIED.push(...d.qualifiedThirds);
  KO = Object.assign({ reach8:[], reach4:[], reachSemi:[], reachFinal:[], champion:null }, d.knockout||{});

  body.innerHTML = `<div class="banner banner-info"><span class="ico">🏆</span><div>Marca los equipos que <b>realmente avanzaron</b> en cada ronda. Cada ronda se elige entre los de la ronda anterior. Esto da los puntos de eliminatorias (octavos/cuartos ×2, semis/final ×3, +bonus campeón).</div></div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:1rem"><button class="btn btn-primary" onclick="saveKO()">💾 Guardar eliminatorias</button></div>
    <div id="kobody"></div>`;
  drawKO();
}

function drawKO() {
  const c = document.getElementById('kobody'); if(!c) return;
  let html='';
  for (const st of KO_STAGES) {
    const pool = st.from==='qualified' ? KO_QUALIFIED : (KO[st.from]||[]);
    const sel = st.single ? (KO[st.key]?[KO[st.key]]:[]) : (KO[st.key]||[]);
    html += `<div style="margin-bottom:1.4rem">
      <div style="font-weight:700;margin-bottom:.6rem">${st.label} <span style="color:var(--muted);font-weight:500">· ${sel.length}/${st.max}</span></div>
      <div class="ko-pool">
        ${pool.map(t=>`<div class="pool-team ${sel.includes(t)?'on':''}" onclick="toggleKO('${st.key}','${t}',${st.max},${!!st.single})">
          <span class="flag">${fl(t)}</span><span>${esc(tn(t))}</span></div>`).join('')||'<span style="color:var(--muted)">Define primero la ronda anterior</span>'}
      </div></div>`;
  }
  c.innerHTML = html;
}

function toggleKO(key, team, max, single) {
  if (single) { KO[key] = (KO[key]===team)?null:team; drawKO(); return; }
  const arr = KO[key] || (KO[key]=[]);
  const i = arr.indexOf(team);
  if (i>=0) arr.splice(i,1);
  else { if (arr.length>=max) { toast(`Máximo ${max} en esta ronda`,'err'); return; } arr.push(team); }
  // limpiar rondas posteriores que dejen de ser subconjunto
  const chain=['reach8','reach4','reachSemi','reachFinal'];
  const idx=chain.indexOf(key);
  if(idx>=0){ for(let j=idx+1;j<chain.length;j++){ KO[chain[j]]=(KO[chain[j]]||[]).filter(t=>(KO[chain[j-1]]||[]).includes(t)); }
    if(KO.champion && !(KO.reachFinal||[]).includes(KO.champion)) KO.champion=null; }
  drawKO();
}

async function saveKO() {
  try { await api('PUT','/api/admin/knockout', KO); toast('Eliminatorias guardadas'); }
  catch(e){ toast(e.message,'err'); }
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function toast(msg,type='ok'){
  const old=document.getElementById('toast'); if(old)old.remove();
  const t=document.createElement('div'); t.id='toast'; t.className=`toast ${type}`; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(),2600);
}

window.go=go; window.logout=logout; window.doLogin=doLogin; window.setSub=setSub;
window.saveDraft=saveDraft; window.submitQuiniela=submitQuiniela;
window.setAdminTab=setAdminTab; window.createUser=createUser; window.delUser=delUser;
window.resetPass=resetPass; window.unlock=unlock; window.saveResults=saveResults;
window.pick=pick;
window.toggleKO=toggleKO; window.saveKO=saveKO;
window.viewParticipant=viewParticipant; window.closeParticipant=closeParticipant; window.setPvTab=setPvTab;
init();
