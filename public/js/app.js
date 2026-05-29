// ════════════════════════════════════════════════════════════════════════════
// QUINIELA DHL · MUNDIAL 2026 — Frontend SPA
// ════════════════════════════════════════════════════════════════════════════
const S = {
  user: null, meta: null,
  pred: { scores: {}, submitted: 0 },
  page: 'ranking', subtab: 'grupos',
};
const GROUP_ORDER = ['A','B','C','D','E','F','G','H','I','J','K','L'];

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
}

function nav() {
  const n = document.createElement('div');
  const link = (id, label) => `<button class="nav-link ${S.page===id?'active':''}" onclick="go('${id}')">${label}</button>`;
  n.innerHTML = `
  <div class="dhl-stripe"></div>
  <nav><div class="nav-inner">
    <div class="brand"><span class="brand-logo">DHL</span><span class="brand-sub">Quiniela Mundial 2026</span></div>
    <div class="nav-links">
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
async function renderRanking(main) {
  main.innerHTML = `<div class="page-head"><div><h1>Tabla de Posiciones</h1><div class="sub">Se actualiza con cada resultado que registra el admin</div></div></div><div id="rk">Cargando…</div>`;
  try {
    const d = await api('GET','/api/ranking');
    const r = d.ranking;
    let html = `<div class="stats">
      <div class="stat accent"><div class="lbl">Participantes</div><div class="val">${r.length}</div></div>
      <div class="stat"><div class="lbl">Partidos jugados</div><div class="val">${d.playedMatches}<span style="font-size:1rem;color:var(--muted)">/${d.totalMatches}</span></div></div>
      <div class="stat"><div class="lbl">Líder</div><div class="val" style="font-size:1.2rem">${r[0]?esc(r[0].displayName):'—'}</div></div>
      <div class="stat"><div class="lbl">Fase grupos</div><div class="val" style="font-size:1.1rem">${d.groupStageComplete?'Completa':'En curso'}</div></div>
    </div>`;
    if (!r.length) {
      html += `<div class="card card-pad"><div class="empty"><div class="ico">👥</div><h3>Sin participantes todavía</h3><p>El admin debe crear los usuarios.</p></div></div>`;
    } else {
      html += `<div class="card" style="overflow:hidden"><table class="rank-table"><thead><tr>
        <th>#</th><th>Participante</th><th>Total</th><th>Grupos</th><th>Clasif.</th><th>Exactos</th><th>Estado</th>
      </tr></thead><tbody>`;
      r.forEach((u,i) => {
        const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
        html += `<tr>
          <td class="pos p${i+1}">${medal||(i+1)}</td>
          <td class="name">${esc(u.displayName)}</td>
          <td><span class="pts">${u.total}</span></td>
          <td>${u.groupPoints}</td>
          <td>${u.qualifiersScored?`<span class="chip chip-green">${u.correctQualifiers}/32</span>`:`<span class="chip chip-gray">—</span>`}</td>
          <td><span class="chip chip-yellow">✓ ${u.exactCount}</span></td>
          <td>${u.submitted?`<span class="chip chip-green">Enviada</span>`:`<span class="chip chip-red">Pendiente</span>`}</td>
        </tr>`;
      });
      html += `</tbody></table></div>
      <p class="bracket-note" style="margin-top:.9rem">Puntuación: <b>5</b> marcador exacto · <b>2</b> resultado correcto · <b>0</b> fallo · <b>+3</b> por cada equipo que acertaste como clasificado a 16avos. Desempate: más marcadores exactos.</p>`;
    }
    document.getElementById('rk').innerHTML = html;
  } catch(e){ document.getElementById('rk').innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; }
}

// ─── MI QUINIELA ───────────────────────────────────────────────────────────────
function filledCount(){ return S.meta.matches.filter(m=>{const s=S.pred.scores[m.key];return s&&Number.isInteger(s.a)&&Number.isInteger(s.b);}).length; }

function renderQuiniela(main) {
  const locked = !!S.pred.submitted;
  const filled = filledCount();
  const pct = Math.round(filled/72*100);
  main.innerHTML = `
    <div class="page-head"><div><h1>Mi Quiniela</h1><div class="sub">Predice los 72 partidos de la fase de grupos</div></div></div>
    ${locked ? `<div class="banner banner-ok"><span class="ico">🔒</span><div><strong>Quiniela enviada y bloqueada.</strong> Ya no puedes modificarla. Abajo puedes ver tu cuadro de clasificados.</div></div>`
             : `<div class="progress"><div class="row"><span>Avance</span><span>${filled}/72</span></div><div class="bar"><div style="width:${pct}%"></div></div></div>
                <div class="banner banner-info"><span class="ico">⚠️</span><div>Cuando envíes tu quiniela quedará <b>bloqueada permanentemente</b>. Tus dieciseisavos se calculan solos a partir de estos resultados.</div></div>`}
    <div class="subtabs">
      <button class="subtab ${S.subtab==='grupos'?'active':''}" onclick="setSub('grupos')">⚽ Partidos</button>
      <button class="subtab ${S.subtab==='tablas'?'active':''}" onclick="setSub('tablas')">📊 Mis tablas</button>
      <button class="subtab ${S.subtab==='bracket'?'active':''}" onclick="setSub('bracket')">🗺️ Mi cuadro (16avos)</button>
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
      <span class="count">Avance <b id="cnt">${filledCount()}</b>/72</span>
      <button class="btn btn-ghost btn-sm" onclick="saveDraft()">Guardar borrador</button>
      <button class="btn btn-yellow btn-sm" id="subbtn" onclick="submitQuiniela()">🔒 Enviar definitiva</button>
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
}

async function saveDraft() {
  try { await api('PUT','/api/prediction',{scores:S.pred.scores}); toast('Borrador guardado'); }
  catch(e){ toast(e.message,'err'); }
}

async function submitQuiniela() {
  const filled = filledCount();
  if (filled < 72) { toast(`Faltan ${72-filled} partidos`, 'err'); return; }
  if (!confirm('¿Enviar tu quiniela? Quedará BLOQUEADA y no podrás modificarla.')) return;
  try {
    await api('PUT','/api/prediction',{scores:S.pred.scores});
    await api('POST','/api/prediction/submit',{scores:S.pred.scores});
    S.pred.submitted = 1;
    toast('¡Quiniela enviada! 🔒');
    render();
  } catch(e){ toast(e.message,'err'); }
}

// ─── MIS TABLAS ────────────────────────────────────────────────────────────────
async function renderMyTables(body) {
  body.innerHTML = `<div class="bracket-note">Tablas calculadas con tus predicciones (puntos → dif. de gol → goles a favor → enfrentamiento directo). <span class="tag tag-q">CLASIFICA</span> 1° y 2° · <span class="tag tag-3">3°</span> puede entrar como mejor tercero.</div><div id="tabs-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem"></div>`;
  let q;
  try { q = await api('GET','/api/prediction/bracket'); } catch(e){ body.innerHTML=`<div class="alert alert-error">${esc(e.message)}</div>`; return; }
  const grid = document.getElementById('tabs-grid');
  const qualThirds = new Set(q.qualifiedThirds);
  for (const g of GROUP_ORDER) {
    const tbl = q.allTables[g];
    const card = document.createElement('div'); card.className='card card-pad';
    let rows = tbl.map((t,i) => {
      const cls = i===0?'qual-1':i===1?'qual-2':i===2?(qualThirds.has(t.team)?'qual-3':'qual-out'):'qual-out';
      let badge='';
      if (i<2) badge=`<span class="tag tag-q">Clasifica</span>`;
      else if (i===2) badge = qualThirds.has(t.team)?`<span class="tag tag-q">Mejor 3°</span>`:`<span class="tag tag-3">3°</span>`;
      return `<tr class="${cls}"><td>${fl(t.team)} <b>${esc(tn(t.team))}</b> ${badge}</td>
        <td class="num">${t.pts}</td><td class="num">${t.dg>0?'+':''}${t.dg}</td><td class="num">${t.gf}</td></tr>`;
    }).join('');
    card.innerHTML = `<div class="group-title" style="margin-bottom:.5rem"><span class="group-badge">${g}</span><span class="gname">Grupo ${g}</span></div>
      <table class="mini-table"><thead><tr><th>Equipo</th><th class="num">Pts</th><th class="num">DG</th><th class="num">GF</th></tr></thead><tbody>${rows}</tbody></table>`;
    grid.appendChild(card);
  }
}

// ─── MI CUADRO (16avos) ──────────────────────────────────────────────────────
async function renderMyBracket(body) {
  let q;
  try { q = await api('GET','/api/prediction/bracket'); } catch(e){ body.innerHTML=`<div class="alert alert-error">${esc(e.message)}</div>`; return; }
  const winners = {}, runners = {};
  for (const g of GROUP_ORDER){ winners[g]=q.allTables[g][0].team; runners[g]=q.allTables[g][1].team; }
  const thirds = q.qualifiedThirds.slice();

  // Estructura de 16avos: 8 llaves "ganador vs tercero" (1A,1B,1D,1E,1G,1I,1K,1L)
  // y 8 llaves "2° vs 2°/1°" según patrón estándar. Las llaves con tercero se
  // muestran con los mejores terceros disponibles (asignación ilustrativa: el
  // orden NO afecta la puntuación, que es por equipos clasificados).
  const winnerSlots = ['A','B','D','E','G','I','K','L'];
  const ties = [];
  winnerSlots.forEach((g,i) => {
    ties.push({ label:`16avos · llave ${i+1}`, s1:{team:winners[g],pos:`1° ${g}`}, s2:{team:thirds[i]||null,pos:'Mejor 3°'} });
  });
  // Llaves restantes entre 1°/2° (cruces fijos representativos)
  const pairs = [['C','F'],['H','J'],['L','K'],['A','C'],['E','I'],['B','D'],['G','H'],['J','L']];
  pairs.forEach(([a,b],i) => {
    ties.push({ label:`16avos · llave ${i+9}`, s1:{team:winners[a],pos:`1° ${a}`}, s2:{team:runners[b],pos:`2° ${b}`} });
  });

  body.innerHTML = `<div class="bracket-note">Tu cuadro de <b>dieciseisavos</b> según tus predicciones. Clasifican <b>1°</b>, <b>2°</b> de cada grupo y los <b>8 mejores terceros</b>. La colocación exacta de los terceros la fija FIFA al cerrar la fase de grupos; <b>no afecta tu puntuación</b> (se premia acertar qué equipos clasifican).</div>
    <div class="r32-grid">${ties.map(t=>`
      <div class="tie"><div class="h">${t.label}</div>
        <div class="side"><span class="flag">${t.s1.team?fl(t.s1.team):'⬜'}</span> <span>${t.s1.team?esc(tn(t.s1.team)):'—'}</span><span class="pos">${t.s1.pos}</span></div>
        <div class="side"><span class="flag">${t.s2.team?fl(t.s2.team):'⬜'}</span> <span>${t.s2.team?esc(tn(t.s2.team)):'Por definir'}</span><span class="pos">${t.s2.pos}</span></div>
      </div>`).join('')}</div>`;
}

// ─── RESULTADOS (oficiales) ─────────────────────────────────────────────────────
async function renderResultados(main) {
  main.innerHTML = `<div class="page-head"><div><h1>Resultados Oficiales</h1><div class="sub">Marcadores reales de la fase de grupos</div></div></div><div id="rbody">Cargando…</div>`;
  let real = {};
  try { real = await api('GET','/api/results'); } catch { real = {}; }
  renderResultsView(document.getElementById('rbody'), real, false);
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
      <button class="subtab ${S.subtab!=='users'?'active':''}" onclick="setAdminTab('results')">⚽ Resultados</button>
    </div><div id="abody"></div>`;
  if (S.subtab!=='users' && S.subtab!=='results') S.subtab='users';
  renderAdminBody();
}
function setAdminTab(t){ S.subtab=t; renderAdmin(document.querySelector('main')); }
function renderAdminBody(){ const b=document.getElementById('abody'); if(!b)return; S.subtab==='results'?adminResults(b):adminUsers(b); }

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
  body.innerHTML=`<div class="banner banner-info"><span class="ico">⚽</span><div>Ingresa los marcadores reales. El ranking se actualiza solo. Los puntos por clasificados a 16avos se otorgan cuando estén los 72 partidos.</div></div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:1rem"><button class="btn btn-primary" onclick="saveResults()">💾 Guardar resultados</button></div>
    <div id="resbody"></div>`;
  ADMIN_RESULTS = await api('GET','/api/admin/results');
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
  // limpia entradas incompletas
  const clean={}; for(const k of Object.keys(ADMIN_RESULTS)){const s=ADMIN_RESULTS[k]; if(s&&Number.isInteger(s.a)&&Number.isInteger(s.b))clean[k]=s;}
  try{ const r=await api('PUT','/api/admin/results',{scores:clean}); toast(`Guardado (${r.count} partidos)`); }
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
init();