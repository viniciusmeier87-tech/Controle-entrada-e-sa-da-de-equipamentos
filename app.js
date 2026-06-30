// ── Supabase config ───────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://qrfzhnheqevskqatjubp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_LohhJtfq3fNhQPb9hobzqw_iVh6yXa2';
const API = (table) => `${SUPABASE_URL}/rest/v1/${table}`;
const HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Prefer': 'return=representation'
};

async function sbGet(table, query = '') {
  const r = await fetch(`${API(table)}?${query}`, { headers: HEADERS });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbPost(table, body) {
  const r = await fetch(API(table), { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbPatch(table, query, body) {
  const r = await fetch(`${API(table)}?${query}`, { method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=representation' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbDelete(table, query) {
  const r = await fetch(`${API(table)}?${query}`, { method: 'DELETE', headers: HEADERS });
  if (!r.ok) throw new Error(await r.text());
}

// ── State ─────────────────────────────────────────────────────────────────────
let records      = [];
let equipamentos = [];
let tecnicos     = [];
let modalRecordId = null;
let editContext   = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }

function formatDate(d) {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

function diasEmUso(dataSaida, dataRetorno) {
  const s = new Date(dataSaida);
  const r = dataRetorno ? new Date(dataRetorno) : new Date();
  return Math.max(0, Math.round((r - s) / 86400000));
}

function getStatus(rec) {
  if (rec.data_retorno) return 'Devolvido';
  if (diasEmUso(rec.data_saida) > 10) return 'Em atraso';
  return 'Em uso';
}

function badgeClass(status) {
  if (status === 'Devolvido') return 'devolvido';
  if (status === 'Em atraso') return 'atraso';
  return 'em-uso';
}

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function setLoading(on) {
  document.getElementById('loading-bar').style.display = on ? 'block' : 'none';
}

function populateSelect(id, opts) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = opts.map(o => `<option value="${o}">${o}</option>`).join('');
}

function refreshFormSelects() {
  const se = equipamentos.slice().sort();
  const st = tecnicos.slice().sort();
  populateSelect('s-equip', se);
  populateSelect('s-tecnico', st);
  refreshHistoricoFilters();
}

function refreshHistoricoFilters() {
  const fe = document.getElementById('filt-equip');
  const ft = document.getElementById('filt-tecnico');
  if (!fe || !ft) return;
  const curE = fe.value, curT = ft.value;
  fe.innerHTML = '<option value="">Todos equipamentos</option>' +
    equipamentos.slice().sort().map(e => `<option value="${e}">${e}</option>`).join('');
  ft.innerHTML = '<option value="">Todos técnicos</option>' +
    tecnicos.slice().sort().map(t => `<option value="${t}">${t}</option>`).join('');
  fe.value = curE; ft.value = curT;
}

// ── Tab navigation ─────────────────────────────────────────────────────────────
function setTab(tab) {
  const order = ['dashboard','saida','devolucao','historico','cadastro'];
  document.querySelectorAll('.tab').forEach((el, i) => {
    const active = order[i] === tab;
    el.classList.toggle('active', active);
    el.setAttribute('aria-selected', active);
  });
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + tab).classList.add('active');
  if (tab === 'devolucao') filtrarEmUso();
  if (tab === 'historico') renderHistorico();
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'cadastro')  renderCadastros();
}

// ── Load all data ─────────────────────────────────────────────────────────────
async function loadAll() {
  setLoading(true);
  try {
    const [recs, equips, tecns] = await Promise.all([
      sbGet('registros', 'order=created_at.desc'),
      sbGet('equipamentos', 'order=codigo.asc'),
      sbGet('tecnicos', 'order=nome.asc')
    ]);
    records      = recs;
    equipamentos = equips.map(e => e.codigo);
    tecnicos     = tecns.map(t => t.nome);
    refreshFormSelects();
    renderDashboard();
  } catch(e) {
    showToast('Erro ao carregar dados. Verifique a conexão.', true);
    console.error(e);
  }
  setLoading(false);
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
function renderDashboard() {
  const emUso     = records.filter(r => !r.data_retorno);
  const devolvidos = records.filter(r => r.data_retorno);
  const emAtraso  = emUso.filter(r => diasEmUso(r.data_saida) > 10);

  document.getElementById('stats-cards').innerHTML = `
    <div class="stat"><div class="stat-label">Total de registros</div><div class="stat-value">${records.length}</div></div>
    <div class="stat"><div class="stat-label">Em uso agora</div><div class="stat-value amber">${emUso.length}</div></div>
    <div class="stat"><div class="stat-label">Devolvidos</div><div class="stat-value green">${devolvidos.length}</div></div>
    <div class="stat"><div class="stat-label">Em atraso (+10 dias)</div><div class="stat-value ${emAtraso.length > 0 ? 'red' : ''}">${emAtraso.length}</div></div>
  `;

  const list = document.getElementById('em-uso-list');
  if (!emUso.length) {
    list.innerHTML = '<div class="empty">Nenhum equipamento em uso no momento.</div>';
    return;
  }
  list.innerHTML = emUso.map(r => {
    const dias = diasEmUso(r.data_saida);
    const st = getStatus(r);
    return `<div class="uso-item">
      <div class="uso-info">
        <span class="chip">${r.equipamento}</span>
        <div>
          <div style="font-weight:600;font-size:13px;">${r.projeto || 'Sem projeto'}</div>
          <div class="uso-meta">Técnico: ${r.tecnico} · Saída: ${formatDate(r.data_saida)}</div>
        </div>
      </div>
      <div class="uso-right">
        <span class="badge ${badgeClass(st)}">${dias} dia${dias !== 1 ? 's' : ''}</span>
      </div>
    </div>`;
  }).join('');
}

// ── Saída ──────────────────────────────────────────────────────────────────────
async function registrarSaida() {
  const data    = document.getElementById('s-data').value;
  const equip   = document.getElementById('s-equip').value;
  const tecnico = document.getElementById('s-tecnico').value;
  const issak   = document.getElementById('s-issak').value;
  const projeto = document.getElementById('s-projeto').value.trim();

  ['s-data','s-equip','s-tecnico','s-projeto'].forEach(id =>
    document.getElementById(id).classList.remove('error-field'));

  let erros = [];
  if (!data)    { erros.push('Data de entrega'); document.getElementById('s-data').classList.add('error-field'); }
  if (!projeto) { erros.push('Projeto / local'); document.getElementById('s-projeto').classList.add('error-field'); }
  if (erros.length) { showToast('Preencha os campos obrigatórios: ' + erros.join(', ') + '.', true); return; }

  const emUso = records.find(r => r.equipamento === equip && !r.data_retorno);
  if (emUso) { showToast(`${equip} já está em uso pelo técnico ${emUso.tecnico}.`, true); return; }

  setLoading(true);
  try {
    const novo = { id: Date.now(), data_saida: data, data_retorno: null, equipamento: equip, tecnico, issak, projeto, ensaios: '' };
    const [saved] = await sbPost('registros', novo);
    records.unshift(saved);
    renderDashboard();
    showToast(`Saída de ${equip} registrada com sucesso.`);
    limparFormSaida();
  } catch(e) {
    showToast('Erro ao registrar saída. Tente novamente.', true);
    console.error(e);
  }
  setLoading(false);
}

function limparFormSaida() {
  document.getElementById('s-data').value = today();
  document.getElementById('s-projeto').value = '';
  ['s-data','s-equip','s-tecnico','s-projeto'].forEach(id =>
    document.getElementById(id).classList.remove('error-field'));
}

// ── Devolução ──────────────────────────────────────────────────────────────────
function filtrarEmUso() {
  const q = (document.getElementById('dev-search').value || '').toLowerCase();
  const emUso = records.filter(r =>
    !r.data_retorno && (
      r.equipamento.toLowerCase().includes(q) ||
      (r.tecnico || '').toLowerCase().includes(q) ||
      (r.projeto  || '').toLowerCase().includes(q)
    )
  );
  const list = document.getElementById('dev-list');
  if (!emUso.length) { list.innerHTML = '<div class="empty">Nenhum equipamento em uso encontrado.</div>'; return; }
  list.innerHTML = emUso.map(r => {
    const dias = diasEmUso(r.data_saida);
    const st   = getStatus(r);
    return `<div class="dev-item">
      <div class="dev-info">
        <div class="dev-title"><span class="chip" style="margin-right:8px">${r.equipamento}</span>${r.projeto || 'Sem projeto'}</div>
        <div class="dev-meta">Técnico: ${r.tecnico} · Responsável: ${r.issak} · Saída: ${formatDate(r.data_saida)}</div>
      </div>
      <div class="dev-right">
        <span class="badge ${badgeClass(st)}">${dias}d</span>
        <button class="btn danger devolver" onclick="abrirModalDevolucao(${r.id})">Devolver</button>
      </div>
    </div>`;
  }).join('');
}

function abrirModalDevolucao(id) {
  const rec = records.find(r => r.id === id);
  if (!rec) return;
  modalRecordId = id;
  document.getElementById('modal-equip-info').innerHTML = `
    <div class="modal-equip-name">${rec.equipamento}</div>
    <div class="modal-equip-meta">Projeto: ${rec.projeto || '—'} · Técnico: ${rec.tecnico} · Saída: ${formatDate(rec.data_saida)}</div>
  `;
  const ta = document.getElementById('dev-ensaios');
  ta.value = ''; ta.classList.remove('error-field');
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => ta.focus(), 100);
}

function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  modalRecordId = null;
}
function closeModal(e) { if (e.target === document.getElementById('modal-overlay')) fecharModal(); }

async function confirmarDevolucao() {
  const ensaios = document.getElementById('dev-ensaios').value.trim();
  const ta = document.getElementById('dev-ensaios');
  ta.classList.remove('error-field');
  if (!ensaios) { ta.classList.add('error-field'); showToast('Descreva os ensaios replicados para confirmar a devolução.', true); ta.focus(); return; }

  setLoading(true);
  try {
    const dataRetorno = today();
    await sbPatch('registros', `id=eq.${modalRecordId}`, { data_retorno: dataRetorno, ensaios });
    const rec = records.find(r => r.id === modalRecordId);
    if (rec) { rec.data_retorno = dataRetorno; rec.ensaios = ensaios; }
    fecharModal();
    renderDashboard();
    filtrarEmUso();
    showToast(`${rec?.equipamento} devolvido com sucesso.`);
  } catch(e) {
    showToast('Erro ao registrar devolução. Tente novamente.', true);
    console.error(e);
  }
  setLoading(false);
}

// ── Histórico ──────────────────────────────────────────────────────────────────
function renderHistorico() {
  refreshHistoricoFilters();
  const q       = (document.getElementById('hist-search').value || '').toLowerCase();
  const fStatus = document.getElementById('filt-status').value;
  const fEquip  = document.getElementById('filt-equip').value;
  const fTec    = document.getElementById('filt-tecnico').value;

  const filtered = records.filter(r => {
    const st = getStatus(r);
    const matchQ = !q || [r.equipamento, r.tecnico, r.projeto, r.ensaios]
      .some(v => (v || '').toLowerCase().includes(q));
    return matchQ && (!fStatus || st === fStatus) && (!fEquip || r.equipamento === fEquip) && (!fTec || r.tecnico === fTec);
  });

  const tbody = document.getElementById('hist-tbody');
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="10"><div class="empty">Nenhum registro encontrado.</div></td></tr>'; return; }

  tbody.innerHTML = filtered.map(r => {
    const st   = getStatus(r);
    const dias = r.data_retorno ? diasEmUso(r.data_saida, r.data_retorno) : diasEmUso(r.data_saida);
    return `<tr>
      <td><span class="chip">${r.equipamento}</span></td>
      <td>${r.projeto || '—'}</td>
      <td>${r.tecnico}</td>
      <td>${r.issak || '—'}</td>
      <td>${formatDate(r.data_saida)}</td>
      <td>${formatDate(r.data_retorno)}</td>
      <td>${dias}</td>
      <td class="ensaios-cell">${r.ensaios || '—'}</td>
      <td><span class="badge ${badgeClass(st)}">${st}</span></td>
      <td>${!r.data_retorno ? `<button class="btn danger devolver" onclick="abrirModalDevolucao(${r.id})">Devolver</button>` : ''}</td>
    </tr>`;
  }).join('');
}

// ── Export CSV ─────────────────────────────────────────────────────────────────
function exportarCSV() {
  const header = ['Equipamento','Projeto','Técnico','Responsável','Saída','Devolução','Dias em uso','Ensaios realizados','Status'];
  const rows = records.map(r => {
    const dias = r.data_retorno ? diasEmUso(r.data_saida, r.data_retorno) : diasEmUso(r.data_saida);
    return [r.equipamento, r.projeto||'', r.tecnico, r.issak||'', formatDate(r.data_saida), formatDate(r.data_retorno), dias, r.ensaios||'', getStatus(r)]
      .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
  });
  const csv  = [header.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `equipamentos_${today()}.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exportado com sucesso.');
}

// ── Cadastros ──────────────────────────────────────────────────────────────────
function renderCadastros() { renderEquipList(); renderFuncList(); }

function renderEquipList() {
  const list = document.getElementById('equip-list');
  const sorted = equipamentos.slice().sort();
  if (!sorted.length) { list.innerHTML = '<div class="empty">Nenhum equipamento cadastrado.</div>'; return; }
  list.innerHTML = sorted.map(e => {
    const inUse = records.some(r => r.equipamento === e && !r.data_retorno);
    return `<div class="cad-item">
      <span class="cad-item-name">${e}</span>
      ${inUse ? '<span class="badge em-uso" style="font-size:10px;">Em uso</span>' : ''}
      <div class="cad-actions">
        <button class="btn-icon edit" title="Editar" onclick="abrirEdicao('equip','${e.replace(/'/g,"\\'")}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon del" title="Remover" onclick="removerEquipamento('${e.replace(/'/g,"\\'")}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

function renderFuncList() {
  const list = document.getElementById('func-list');
  const sorted = tecnicos.slice().sort();
  if (!sorted.length) { list.innerHTML = '<div class="empty">Nenhum técnico cadastrado.</div>'; return; }
  list.innerHTML = sorted.map(t => {
    const hasRec = records.some(r => r.tecnico === t);
    return `<div class="cad-item">
      <span class="cad-item-name">${t}</span>
      ${hasRec ? '<span class="badge devolvido" style="font-size:10px;">Com registros</span>' : ''}
      <div class="cad-actions">
        <button class="btn-icon edit" title="Editar" onclick="abrirEdicao('func','${t.replace(/'/g,"\\'")}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon del" title="Remover" onclick="removerFuncionario('${t.replace(/'/g,"\\'")}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

async function addEquipamento() {
  const inp = document.getElementById('equip-input');
  const val = inp.value.trim().toUpperCase();
  if (!val) { inp.classList.add('error-field'); showToast('Digite o código do equipamento.', true); return; }
  if (equipamentos.includes(val)) { showToast(`${val} já está cadastrado.`, true); return; }
  setLoading(true);
  try {
    await sbPost('equipamentos', { codigo: val });
    equipamentos.push(val);
    refreshFormSelects(); renderEquipList();
    inp.value = ''; inp.classList.remove('error-field');
    showToast(`${val} adicionado com sucesso.`);
  } catch(e) { showToast('Erro ao adicionar equipamento.', true); console.error(e); }
  setLoading(false);
}

async function removerEquipamento(codigo) {
  if (records.some(r => r.equipamento === codigo && !r.data_retorno)) {
    showToast(`Não é possível remover ${codigo}: equipamento em uso.`, true); return;
  }
  if (!confirm(`Remover "${codigo}" do cadastro?`)) return;
  setLoading(true);
  try {
    await sbDelete('equipamentos', `codigo=eq.${encodeURIComponent(codigo)}`);
    equipamentos = equipamentos.filter(e => e !== codigo);
    refreshFormSelects(); renderEquipList();
    showToast(`${codigo} removido.`);
  } catch(e) { showToast('Erro ao remover equipamento.', true); console.error(e); }
  setLoading(false);
}

async function addFuncionario() {
  const inp = document.getElementById('func-input');
  const val = inp.value.trim();
  if (!val) { inp.classList.add('error-field'); showToast('Digite o nome do técnico.', true); return; }
  if (tecnicos.some(t => t.toLowerCase() === val.toLowerCase())) { showToast(`${val} já está cadastrado.`, true); return; }
  setLoading(true);
  try {
    await sbPost('tecnicos', { nome: val });
    tecnicos.push(val);
    refreshFormSelects(); renderFuncList();
    inp.value = ''; inp.classList.remove('error-field');
    showToast(`${val} adicionado com sucesso.`);
  } catch(e) { showToast('Erro ao adicionar técnico.', true); console.error(e); }
  setLoading(false);
}

async function removerFuncionario(nome) {
  if (records.some(r => r.tecnico === nome && !r.data_retorno)) {
    showToast(`Não é possível remover ${nome}: técnico com equipamento em uso.`, true); return;
  }
  if (!confirm(`Remover "${nome}" do cadastro?`)) return;
  setLoading(true);
  try {
    await sbDelete('tecnicos', `nome=eq.${encodeURIComponent(nome)}`);
    tecnicos = tecnicos.filter(t => t !== nome);
    refreshFormSelects(); renderFuncList();
    showToast(`${nome} removido.`);
  } catch(e) { showToast('Erro ao remover técnico.', true); console.error(e); }
  setLoading(false);
}

// ── Modal edição ───────────────────────────────────────────────────────────────
function abrirEdicao(type, oldValue) {
  editContext = { type, oldValue };
  document.getElementById('edit-title').textContent = type === 'equip' ? 'Editar equipamento' : 'Editar técnico';
  document.getElementById('edit-label').textContent = type === 'equip' ? 'Código do equipamento' : 'Nome do técnico';
  const inp = document.getElementById('edit-input');
  inp.value = oldValue; inp.classList.remove('error-field');
  document.getElementById('edit-overlay').classList.add('open');
  setTimeout(() => inp.focus(), 100);
}

function fecharEditModal() { document.getElementById('edit-overlay').classList.remove('open'); editContext = null; }
function closeEditModal(e) { if (e.target === document.getElementById('edit-overlay')) fecharEditModal(); }

async function confirmarEdicao() {
  if (!editContext) return;
  const inp = document.getElementById('edit-input');
  let newVal = inp.value.trim();
  if (!newVal) { inp.classList.add('error-field'); showToast('O campo não pode ficar vazio.', true); return; }
  if (editContext.type === 'equip') newVal = newVal.toUpperCase();
  const { type, oldValue } = editContext;

  setLoading(true);
  try {
    if (type === 'equip') {
      if (equipamentos.includes(newVal) && newVal !== oldValue) { showToast(`${newVal} já existe.`, true); setLoading(false); return; }
      await sbPatch('equipamentos', `codigo=eq.${encodeURIComponent(oldValue)}`, { codigo: newVal });
      await sbPatch('registros', `equipamento=eq.${encodeURIComponent(oldValue)}`, { equipamento: newVal });
      equipamentos = equipamentos.map(e => e === oldValue ? newVal : e);
      records.forEach(r => { if (r.equipamento === oldValue) r.equipamento = newVal; });
      refreshFormSelects(); renderEquipList();
    } else {
      if (tecnicos.some(t => t.toLowerCase() === newVal.toLowerCase() && t !== oldValue)) { showToast(`${newVal} já existe.`, true); setLoading(false); return; }
      await sbPatch('tecnicos', `nome=eq.${encodeURIComponent(oldValue)}`, { nome: newVal });
      await sbPatch('registros', `tecnico=eq.${encodeURIComponent(oldValue)}`, { tecnico: newVal });
      tecnicos = tecnicos.map(t => t === oldValue ? newVal : t);
      records.forEach(r => { if (r.tecnico === oldValue) r.tecnico = newVal; });
      refreshFormSelects(); renderFuncList();
    }
    fecharEditModal();
    showToast('Cadastro atualizado com sucesso.');
  } catch(e) { showToast('Erro ao atualizar. Tente novamente.', true); console.error(e); }
  setLoading(false);
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { fecharModal(); fecharEditModal(); }
});
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('equip-input').addEventListener('keydown', e => { if (e.key === 'Enter') addEquipamento(); });
  document.getElementById('func-input').addEventListener('keydown', e => { if (e.key === 'Enter') addFuncionario(); });
  document.getElementById('edit-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmarEdicao(); });
});

// ── Init ───────────────────────────────────────────────────────────────────────
document.getElementById('s-data').value = today();
loadAll();
