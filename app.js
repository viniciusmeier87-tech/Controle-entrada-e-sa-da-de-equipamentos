// ── Default data ──────────────────────────────────────────────────────────────
const DEFAULT_EQUIPAMENTOS = [
  'MP-002','MP-006','MP-007','MP-009','MP-011','MP-012','MP-013',
  'MP-014','MP-015','MP-016','MP-017','MP-018','MP-019','MP-020',
  'MP-021','MP-022',
  'TB-013','TB-015','TB-018','TB-022','TB-023','TB-024','TB-025',
  'TB-026','TB-027','TB-028','TB-029','TB-030','TB-031','TB-032','TB-043',
  'DH-002','DH-006',
  'CC-001','CC-002','CC-003','CC-004','CC-005','CC-006','CC-007',
  'BB-001','BB-002','BB-003','BB-004','BB-005','BB-006','BB-007',
  'VAPOR-001','VAPOR-002','VAPOR-003','VAPOR-004'
];

const DEFAULT_TECNICOS = [
  'Alexander','Cristiano','Emanoel','Elielton','Filipe',
  'Gabriel','Gustavo','Gustavo Mota','Lucas','Marcos',
  'Ricardo','Ronald','Ruan','Samuel','Sérgio'
];

// ── Storage keys ──────────────────────────────────────────────────────────────
const KEY_RECORDS    = 'equip_ctrl_records';
const KEY_EQUIPAMENTOS = 'equip_ctrl_equipamentos';
const KEY_TECNICOS   = 'equip_ctrl_tecnicos';

// ── State ─────────────────────────────────────────────────────────────────────
let records      = [];
let equipamentos = [];
let tecnicos     = [];
let modalRecordId = null;
let editContext  = null; // { type: 'equip'|'func', index, oldValue }

// ── Persistence ───────────────────────────────────────────────────────────────
function load() {
  try { records      = JSON.parse(localStorage.getItem(KEY_RECORDS))    || []; } catch(e) { records = []; }
  try { equipamentos = JSON.parse(localStorage.getItem(KEY_EQUIPAMENTOS)) || DEFAULT_EQUIPAMENTOS.slice(); } catch(e) { equipamentos = DEFAULT_EQUIPAMENTOS.slice(); }
  try { tecnicos     = JSON.parse(localStorage.getItem(KEY_TECNICOS))   || DEFAULT_TECNICOS.slice(); } catch(e) { tecnicos = DEFAULT_TECNICOS.slice(); }
}
function saveRecords()      { try { localStorage.setItem(KEY_RECORDS, JSON.stringify(records)); } catch(e) {} }
function saveEquipamentos() { try { localStorage.setItem(KEY_EQUIPAMENTOS, JSON.stringify(equipamentos)); } catch(e) {} }
function saveTecnicos()     { try { localStorage.setItem(KEY_TECNICOS, JSON.stringify(tecnicos)); } catch(e) {} }

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
  if (rec.dataRetorno) return 'Devolvido';
  if (diasEmUso(rec.dataSaida) > 10) return 'Em atraso';
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

function populateSelect(id, opts) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = opts.map(o => `<option value="${o}">${o}</option>`).join('');
}

function refreshFormSelects() {
  const sorted_e = equipamentos.slice().sort();
  const sorted_t = tecnicos.slice().sort();
  populateSelect('s-equip', sorted_e);
  populateSelect('s-tecnico', sorted_t);
  // also refresh historico filters if they have content
  refreshHistoricoFilters();
}

function refreshHistoricoFilters() {
  const fe = document.getElementById('filt-equip');
  const ft = document.getElementById('filt-tecnico');
  if (!fe || !ft) return;
  const curE = fe.value;
  const curT = ft.value;
  fe.innerHTML = '<option value="">Todos equipamentos</option>' +
    equipamentos.slice().sort().map(e => `<option value="${e}">${e}</option>`).join('');
  ft.innerHTML = '<option value="">Todos técnicos</option>' +
    tecnicos.slice().sort().map(t => `<option value="${t}">${t}</option>`).join('');
  fe.value = curE;
  ft.value = curT;
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

// ── Dashboard ──────────────────────────────────────────────────────────────────
function renderDashboard() {
  const emUso    = records.filter(r => !r.dataRetorno);
  const devolvidos = records.filter(r => r.dataRetorno);
  const emAtraso = emUso.filter(r => diasEmUso(r.dataSaida) > 10);

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
    const dias = diasEmUso(r.dataSaida);
    const st = getStatus(r);
    return `<div class="uso-item">
      <div class="uso-info">
        <span class="chip">${r.equipamento}</span>
        <div>
          <div style="font-weight:600;font-size:13px;">${r.projeto || 'Sem projeto'}</div>
          <div class="uso-meta">Técnico: ${r.tecnico} · Saída: ${formatDate(r.dataSaida)}</div>
        </div>
      </div>
      <div class="uso-right">
        <span class="badge ${badgeClass(st)}">${dias} dia${dias !== 1 ? 's' : ''}</span>
      </div>
    </div>`;
  }).join('');
}

// ── Saída ──────────────────────────────────────────────────────────────────────
function registrarSaida() {
  const data    = document.getElementById('s-data').value;
  const equip   = document.getElementById('s-equip').value;
  const tecnico = document.getElementById('s-tecnico').value;
  const issak   = document.getElementById('s-issak').value;
  const projeto = document.getElementById('s-projeto').value.trim();

  // Validations
  let erros = [];
  if (!data)    erros.push('Data de entrega');
  if (!equip)   erros.push('Equipamento');
  if (!tecnico) erros.push('Técnico');
  if (!projeto) erros.push('Projeto / local');

  ['s-data','s-equip','s-tecnico','s-projeto'].forEach(id => {
    document.getElementById(id).classList.remove('error-field');
  });
  if (!data)    document.getElementById('s-data').classList.add('error-field');
  if (!projeto) document.getElementById('s-projeto').classList.add('error-field');

  if (erros.length) {
    showToast('Preencha os campos obrigatórios: ' + erros.join(', ') + '.', true);
    return;
  }

  const emUso = records.find(r => r.equipamento === equip && !r.dataRetorno);
  if (emUso) {
    showToast(`${equip} já está em uso pelo técnico ${emUso.tecnico}.`, true);
    return;
  }

  records.unshift({ id: Date.now(), dataSaida: data, dataRetorno: null, equipamento: equip, tecnico, issak, projeto, ensaios: '' });
  saveRecords();
  renderDashboard();
  showToast(`Saída de ${equip} registrada com sucesso.`);
  limparFormSaida();
}

function limparFormSaida() {
  document.getElementById('s-data').value = today();
  document.getElementById('s-projeto').value = '';
  ['s-data','s-equip','s-tecnico','s-projeto'].forEach(id => {
    document.getElementById(id).classList.remove('error-field');
  });
}

// ── Devolução ──────────────────────────────────────────────────────────────────
function filtrarEmUso() {
  const q = (document.getElementById('dev-search').value || '').toLowerCase();
  const emUso = records.filter(r =>
    !r.dataRetorno && (
      r.equipamento.toLowerCase().includes(q) ||
      (r.tecnico || '').toLowerCase().includes(q) ||
      (r.projeto  || '').toLowerCase().includes(q)
    )
  );

  const list = document.getElementById('dev-list');
  if (!emUso.length) {
    list.innerHTML = '<div class="empty">Nenhum equipamento em uso encontrado.</div>';
    return;
  }
  list.innerHTML = emUso.map(r => {
    const dias = diasEmUso(r.dataSaida);
    const st   = getStatus(r);
    return `<div class="dev-item">
      <div class="dev-info">
        <div class="dev-title"><span class="chip" style="margin-right:8px">${r.equipamento}</span>${r.projeto || 'Sem projeto'}</div>
        <div class="dev-meta">Técnico: ${r.tecnico} · Responsável: ${r.issak} · Saída: ${formatDate(r.dataSaida)}</div>
      </div>
      <div class="dev-right">
        <span class="badge ${badgeClass(st)}">${dias}d</span>
        <button class="btn danger devolver" onclick="abrirModalDevolucao(${r.id})">Devolver</button>
      </div>
    </div>`;
  }).join('');
}

// ── Modal devolução ────────────────────────────────────────────────────────────
function abrirModalDevolucao(id) {
  const rec = records.find(r => r.id === id);
  if (!rec) return;
  modalRecordId = id;
  document.getElementById('modal-equip-info').innerHTML = `
    <div class="modal-equip-name">${rec.equipamento}</div>
    <div class="modal-equip-meta">Projeto: ${rec.projeto || '—'} · Técnico: ${rec.tecnico} · Saída: ${formatDate(rec.dataSaida)}</div>
  `;
  const ta = document.getElementById('dev-ensaios');
  ta.value = '';
  ta.classList.remove('error-field');
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => ta.focus(), 100);
}

function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  modalRecordId = null;
}

function closeModal(e) {
  if (e.target === document.getElementById('modal-overlay')) fecharModal();
}

function confirmarDevolucao() {
  const ensaios = document.getElementById('dev-ensaios').value.trim();
  const ta = document.getElementById('dev-ensaios');
  ta.classList.remove('error-field');
  if (!ensaios) {
    ta.classList.add('error-field');
    showToast('Descreva os ensaios replicados realizados para confirmar a devolução.', true);
    ta.focus();
    return;
  }
  const rec = records.find(r => r.id === modalRecordId);
  if (!rec) return;
  rec.dataRetorno = today();
  rec.ensaios = ensaios;
  saveRecords();
  fecharModal();
  renderDashboard();
  filtrarEmUso();
  showToast(`${rec.equipamento} devolvido com sucesso.`);
}

// ── Histórico ──────────────────────────────────────────────────────────────────
function renderHistorico() {
  const q       = (document.getElementById('hist-search').value || '').toLowerCase();
  const fStatus = document.getElementById('filt-status').value;
  const fEquip  = document.getElementById('filt-equip').value;
  const fTec    = document.getElementById('filt-tecnico').value;

  refreshHistoricoFilters();

  const filtered = records.filter(r => {
    const st = getStatus(r);
    const matchQ = !q || [r.equipamento, r.tecnico, r.projeto, r.ensaios]
      .some(v => (v || '').toLowerCase().includes(q));
    return matchQ && (!fStatus || st === fStatus) && (!fEquip || r.equipamento === fEquip) && (!fTec || r.tecnico === fTec);
  });

  const tbody = document.getElementById('hist-tbody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="10"><div class="empty">Nenhum registro encontrado.</div></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const st   = getStatus(r);
    const dias = r.dataRetorno ? diasEmUso(r.dataSaida, r.dataRetorno) : diasEmUso(r.dataSaida);
    return `<tr>
      <td><span class="chip">${r.equipamento}</span></td>
      <td>${r.projeto || '—'}</td>
      <td>${r.tecnico}</td>
      <td>${r.issak || '—'}</td>
      <td>${formatDate(r.dataSaida)}</td>
      <td>${formatDate(r.dataRetorno)}</td>
      <td>${dias}</td>
      <td class="ensaios-cell">${r.ensaios || '—'}</td>
      <td><span class="badge ${badgeClass(st)}">${st}</span></td>
      <td>${!r.dataRetorno ? `<button class="btn danger devolver" onclick="abrirModalDevolucao(${r.id})">Devolver</button>` : ''}</td>
    </tr>`;
  }).join('');
}

// ── Export CSV ─────────────────────────────────────────────────────────────────
function exportarCSV() {
  const header = ['Equipamento','Projeto','Técnico','Responsável','Saída','Devolução','Dias em uso','Ensaios realizados','Status'];
  const rows = records.map(r => {
    const dias = r.dataRetorno ? diasEmUso(r.dataSaida, r.dataRetorno) : diasEmUso(r.dataSaida);
    return [r.equipamento, r.projeto||'', r.tecnico, r.issak||'', formatDate(r.dataSaida), formatDate(r.dataRetorno), dias, r.ensaios||'', getStatus(r)]
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
function renderCadastros() {
  renderEquipList();
  renderFuncList();
}

function renderEquipList() {
  const list = document.getElementById('equip-list');
  const sorted = equipamentos.slice().sort();
  if (!sorted.length) { list.innerHTML = '<div class="empty">Nenhum equipamento cadastrado.</div>'; return; }
  list.innerHTML = sorted.map(e => {
    const idx = equipamentos.indexOf(e);
    const inUse = records.some(r => r.equipamento === e && !r.dataRetorno);
    return `<div class="cad-item">
      <span class="cad-item-name">${e}</span>
      ${inUse ? '<span class="badge em-uso" style="font-size:10px;">Em uso</span>' : ''}
      <div class="cad-actions">
        <button class="btn-icon edit" title="Editar" onclick="abrirEdicao('equip', ${idx}, '${e.replace(/'/g,"\\'")}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon del" title="Remover" onclick="removerEquipamento(${idx})">
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
    const idx = tecnicos.indexOf(t);
    const hasRecords = records.some(r => r.tecnico === t);
    return `<div class="cad-item">
      <span class="cad-item-name">${t}</span>
      ${hasRecords ? '<span class="badge devolvido" style="font-size:10px;">Com registros</span>' : ''}
      <div class="cad-actions">
        <button class="btn-icon edit" title="Editar" onclick="abrirEdicao('func', ${idx}, '${t.replace(/'/g,"\\'")}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon del" title="Remover" onclick="removerFuncionario(${idx})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

function addEquipamento() {
  const inp = document.getElementById('equip-input');
  const val = inp.value.trim().toUpperCase();
  if (!val) { inp.classList.add('error-field'); showToast('Digite o código do equipamento.', true); return; }
  if (equipamentos.includes(val)) { showToast(`${val} já está cadastrado.`, true); return; }
  equipamentos.push(val);
  saveEquipamentos();
  refreshFormSelects();
  renderEquipList();
  inp.value = '';
  inp.classList.remove('error-field');
  showToast(`${val} adicionado com sucesso.`);
}

function removerEquipamento(idx) {
  const nome = equipamentos[idx];
  if (records.some(r => r.equipamento === nome && !r.dataRetorno)) {
    showToast(`Não é possível remover ${nome}: equipamento em uso.`, true);
    return;
  }
  if (!confirm(`Remover "${nome}" do cadastro?`)) return;
  equipamentos.splice(idx, 1);
  saveEquipamentos();
  refreshFormSelects();
  renderEquipList();
  showToast(`${nome} removido.`);
}

function addFuncionario() {
  const inp = document.getElementById('func-input');
  const val = inp.value.trim();
  if (!val) { inp.classList.add('error-field'); showToast('Digite o nome do técnico.', true); return; }
  const exists = tecnicos.some(t => t.toLowerCase() === val.toLowerCase());
  if (exists) { showToast(`${val} já está cadastrado.`, true); return; }
  tecnicos.push(val);
  saveTecnicos();
  refreshFormSelects();
  renderFuncList();
  inp.value = '';
  inp.classList.remove('error-field');
  showToast(`${val} adicionado com sucesso.`);
}

function removerFuncionario(idx) {
  const nome = tecnicos[idx];
  if (records.some(r => r.tecnico === nome && !r.dataRetorno)) {
    showToast(`Não é possível remover ${nome}: técnico com equipamento em uso.`, true);
    return;
  }
  if (!confirm(`Remover "${nome}" do cadastro?`)) return;
  tecnicos.splice(idx, 1);
  saveTecnicos();
  refreshFormSelects();
  renderFuncList();
  showToast(`${nome} removido.`);
}

// ── Modal de edição ────────────────────────────────────────────────────────────
function abrirEdicao(type, idx, oldValue) {
  editContext = { type, idx, oldValue };
  const label = type === 'equip' ? 'Código do equipamento' : 'Nome do técnico';
  document.getElementById('edit-title').textContent = type === 'equip' ? 'Editar equipamento' : 'Editar técnico';
  document.getElementById('edit-label').textContent = label;
  const inp = document.getElementById('edit-input');
  inp.value = oldValue;
  inp.classList.remove('error-field');
  document.getElementById('edit-overlay').classList.add('open');
  setTimeout(() => inp.focus(), 100);
}

function fecharEditModal() {
  document.getElementById('edit-overlay').classList.remove('open');
  editContext = null;
}

function closeEditModal(e) {
  if (e.target === document.getElementById('edit-overlay')) fecharEditModal();
}

function confirmarEdicao() {
  if (!editContext) return;
  const inp = document.getElementById('edit-input');
  let newVal = inp.value.trim();
  if (!newVal) { inp.classList.add('error-field'); showToast('O campo não pode ficar vazio.', true); return; }
  if (editContext.type === 'equip') newVal = newVal.toUpperCase();

  const { type, idx, oldValue } = editContext;

  if (type === 'equip') {
    if (equipamentos.includes(newVal) && newVal !== oldValue) { showToast(`${newVal} já existe.`, true); return; }
    const oldName = equipamentos[idx];
    equipamentos[idx] = newVal;
    // update records that reference old name
    records.forEach(r => { if (r.equipamento === oldName) r.equipamento = newVal; });
    saveEquipamentos(); saveRecords();
    refreshFormSelects();
    renderEquipList();
  } else {
    if (tecnicos.some((t,i) => t.toLowerCase() === newVal.toLowerCase() && i !== idx)) { showToast(`${newVal} já existe.`, true); return; }
    const oldName = tecnicos[idx];
    tecnicos[idx] = newVal;
    records.forEach(r => { if (r.tecnico === oldName) r.tecnico = newVal; });
    saveTecnicos(); saveRecords();
    refreshFormSelects();
    renderFuncList();
  }
  fecharEditModal();
  showToast('Cadastro atualizado com sucesso.');
}

// keyboard ESC to close modals
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    fecharModal();
    fecharEditModal();
  }
});

// enter key on cadastro inputs
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('equip-input').addEventListener('keydown', e => { if (e.key === 'Enter') addEquipamento(); });
  document.getElementById('func-input').addEventListener('keydown', e => { if (e.key === 'Enter') addFuncionario(); });
  document.getElementById('edit-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmarEdicao(); });
});

// ── Init ───────────────────────────────────────────────────────────────────────
(function init() {
  load();
  document.getElementById('s-data').value = today();
  refreshFormSelects();
  renderDashboard();
})();
