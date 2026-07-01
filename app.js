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
let records       = [];
let equipamentos  = [];
let tecnicos      = [];
let modalRecordId = null;
let editContext   = null;

// ── Calibração helpers ────────────────────────────────────────────────────────
function diasParaVencer(validade) {
  if (!validade) return null;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const val  = new Date(validade + 'T00:00:00');
  return Math.round((val - hoje) / 86400000);
}
function statusCalibracao(validade) {
  const d = diasParaVencer(validade);
  if (d === null) return null;
  if (d < 0) return 'vencido';
  if (d <= 15) return 'alerta';
  return 'ok';
}
function calibracaoLabel(validade) {
  const d = diasParaVencer(validade);
  if (d === null) return null;
  if (d < 0)  return `Vencida há ${Math.abs(d)} dia${Math.abs(d) !== 1 ? 's' : ''}`;
  if (d === 0) return 'Vence hoje!';
  if (d <= 15) return `Vence em ${d} dia${d !== 1 ? 's' : ''}`;
  return `Válida até ${formatDate(validade)}`;
}
function equipBloqueado(codigo) {
  const eq = equipamentos.find(e => e.codigo === codigo);
  if (!eq || !eq.validade_calibracao) return false;
  return diasParaVencer(eq.validade_calibracao) < 0;
}

// ── Helpers gerais ────────────────────────────────────────────────────────────
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
  if (diasEmUso(rec.data_saida) > 5) return 'Em atraso';
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
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3800);
}

function setLoading(on) {
  document.getElementById('loading-bar').style.display = on ? 'block' : 'none';
}

function populateSelectEquip(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const sorted = equipamentos.slice().sort((a,b) => a.codigo.localeCompare(b.codigo));
  el.innerHTML = sorted.map(e => {
    const bloq = equipBloqueado(e.codigo);
    return `<option value="${e.codigo}" ${bloq ? 'disabled' : ''}>${e.codigo}${bloq ? ' 🔒 calibração vencida' : ''}</option>`;
  }).join('');
}

function populateSelect(id, opts) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = opts.map(o => `<option value="${o}">${o}</option>`).join('');
}

function refreshFormSelects() {
  populateSelectEquip('s-equip');
  populateSelect('s-tecnico', tecnicos.slice().sort());
  refreshHistoricoFilters();
}

function refreshHistoricoFilters() {
  const fe = document.getElementById('filt-equip');
  const ft = document.getElementById('filt-tecnico');
  if (!fe || !ft) return;
  const curE = fe.value, curT = ft.value;
  fe.innerHTML = '<option value="">Todos equipamentos</option>' +
    equipamentos.slice().sort((a,b) => a.codigo.localeCompare(b.codigo))
      .map(e => `<option value="${e.codigo}">${e.codigo}</option>`).join('');
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

// ── Load all ──────────────────────────────────────────────────────────────────
async function loadAll() {
  setLoading(true);
  try {
    const [recs, equips, tecns] = await Promise.all([
      sbGet('registros', 'order=created_at.desc'),
      sbGet('equipamentos', 'order=codigo.asc'),
      sbGet('tecnicos', 'order=nome.asc')
    ]);
    records      = recs;
    equipamentos = equips.map(e => ({ codigo: e.codigo, validade_calibracao: e.validade_calibracao || null }));
    tecnicos     = tecns.map(t => t.nome);
    refreshFormSelects();
    renderDashboard();
    verificarNotificacoes();
  } catch(e) {
    showToast('Erro ao carregar dados. Verifique a conexão.', true);
    console.error(e);
  }
  setLoading(false);
}

// ── Notificações ──────────────────────────────────────────────────────────────
function verificarNotificacoes() {
  const alertas = equipamentos.filter(e => {
    const st = statusCalibracao(e.validade_calibracao);
    return st === 'alerta' || st === 'vencido';
  });
  const emAtraso = records.filter(r => !r.data_retorno && diasEmUso(r.data_saida) > 5);
  const msgs = [];
  const vencidos = alertas.filter(e => statusCalibracao(e.validade_calibracao) === 'vencido');
  const proximos = alertas.filter(e => statusCalibracao(e.validade_calibracao) === 'alerta');
  if (vencidos.length) msgs.push(`${vencidos.length} equipamento(s) com calibração VENCIDA`);
  if (proximos.length) msgs.push(`${proximos.length} calibração(ões) vencem em até 15 dias`);
  if (emAtraso.length) msgs.push(`${emAtraso.length} equipamento(s) com colaborador há mais de 5 dias`);
  if ('Notification' in window && Notification.permission === 'granted' && msgs.length) {
    new Notification('⚠️ Éllu Ambiental — Equipamentos', { body: msgs.join('\n'), icon: 'icon-192.png' });
  }
}

async function pedirPermissaoNotificacao() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
function renderDashboard() {
  const emUso       = records.filter(r => !r.data_retorno);
  const devolvidos  = records.filter(r => r.data_retorno);
  const emAtraso    = emUso.filter(r => diasEmUso(r.data_saida) > 5);
  const calibVencida = equipamentos.filter(e => statusCalibracao(e.validade_calibracao) === 'vencido');
  const calibAlerta  = equipamentos.filter(e => statusCalibracao(e.validade_calibracao) === 'alerta');

  document.getElementById('stats-cards').innerHTML = `
    <div class="stat"><div class="stat-label">Total registros</div><div class="stat-value">${records.length}</div></div>
    <div class="stat"><div class="stat-label">Em uso agora</div><div class="stat-value amber">${emUso.length}</div></div>
    <div class="stat"><div class="stat-label">Devolvidos</div><div class="stat-value green">${devolvidos.length}</div></div>
    <div class="stat"><div class="stat-label">Com técnico +5 dias</div><div class="stat-value ${emAtraso.length > 0 ? 'red' : ''}">${emAtraso.length}</div></div>
    <div class="stat"><div class="stat-label">Calibração vencida</div><div class="stat-value ${calibVencida.length > 0 ? 'red' : ''}">${calibVencida.length}</div></div>
    <div class="stat"><div class="stat-label">Calibração expirando</div><div class="stat-value ${calibAlerta.length > 0 ? 'amber' : ''}">${calibAlerta.length}</div></div>
  `;

  // Alertas combinados
  const alertasCalib = equipamentos.filter(e => ['vencido','alerta'].includes(statusCalibracao(e.validade_calibracao)));
  const alertasDias  = emUso.filter(r => diasEmUso(r.data_saida) > 5);
  const alertaEl = document.getElementById('alerta-calibracao');

  if (alertasCalib.length || alertasDias.length) {
    alertaEl.style.display = 'block';
    let html = '';

    if (alertasDias.length) {
      html += `<div class="alerta-section-title">⏱️ Equipamentos com técnico há mais de 5 dias</div>`;
      html += alertasDias.sort((a,b) => diasEmUso(b.data_saida) - diasEmUso(a.data_saida)).map(r => {
        const dias = diasEmUso(r.data_saida);
        return `<div class="alerta-item atraso">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="chip chip-red">${r.equipamento}</span>
            <span style="font-size:13px;">${r.tecnico} — ${r.projeto || 'sem projeto'}</span>
          </div>
          <span class="badge atraso">${dias} dias</span>
        </div>`;
      }).join('');
    }

    if (alertasCalib.length) {
      html += `<div class="alerta-section-title" style="margin-top:${alertasDias.length ? '12px' : '0'}">🔧 Alertas de calibração</div>`;
      html += alertasCalib.sort((a,b) => diasParaVencer(a.validade_calibracao) - diasParaVencer(b.validade_calibracao)).map(e => {
        const st = statusCalibracao(e.validade_calibracao);
        return `<div class="alerta-item ${st}">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="chip ${st === 'vencido' ? 'chip-red' : 'chip-amber'}">${e.codigo}</span>
            <span style="font-size:13px;">${calibracaoLabel(e.validade_calibracao)}</span>
          </div>
          <span class="badge ${st === 'vencido' ? 'atraso' : 'em-uso'}">${st === 'vencido' ? '🔒 Bloqueado' : '⚠️ Atenção'}</span>
        </div>`;
      }).join('');
    }
    document.getElementById('alerta-list').innerHTML = html;
  } else {
    alertaEl.style.display = 'none';
  }

  // Em uso
  const list = document.getElementById('em-uso-list');
  if (!emUso.length) { list.innerHTML = '<div class="empty">Nenhum equipamento em uso no momento.</div>'; return; }
  list.innerHTML = emUso.map(r => {
    const dias = diasEmUso(r.data_saida);
    const st = getStatus(r);
    return `<div class="uso-item">
      <div class="uso-info">
        <span class="chip ${st === 'Em atraso' ? 'chip-red' : ''}">${r.equipamento}</span>
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

  ['s-data','s-projeto'].forEach(id => document.getElementById(id).classList.remove('error-field'));
  let erros = [];
  if (!data)    { erros.push('Data de entrega'); document.getElementById('s-data').classList.add('error-field'); }
  if (!projeto) { erros.push('Projeto / local'); document.getElementById('s-projeto').classList.add('error-field'); }
  if (erros.length) { showToast('Preencha: ' + erros.join(', ') + '.', true); return; }

  if (equipBloqueado(equip)) {
    const eq = equipamentos.find(e => e.codigo === equip);
    showToast(`🔒 ${equip} bloqueado: calibração vencida em ${formatDate(eq.validade_calibracao)}.`, true);
    return;
  }
  const emUso = records.find(r => r.equipamento === equip && !r.data_retorno);
  if (emUso) { showToast(`${equip} já está em uso por ${emUso.tecnico}.`, true); return; }

  const eq = equipamentos.find(e => e.codigo === equip);
  if (eq && statusCalibracao(eq.validade_calibracao) === 'alerta') {
    if (!confirm(`⚠️ ${equip}: calibração expira em breve (${calibracaoLabel(eq.validade_calibracao)}).\nDeseja registrar mesmo assim?`)) return;
  }

  setLoading(true);
  try {
    const novo = { id: Date.now(), data_saida: data, data_retorno: null, equipamento: equip, tecnico, issak, projeto, ensaios: '', checklist: null };
    const [saved] = await sbPost('registros', novo);
    records.unshift(saved);
    renderDashboard();
    showToast(`Saída de ${equip} registrada.`);
    limparFormSaida();
  } catch(e) { showToast('Erro ao registrar saída.', true); console.error(e); }
  setLoading(false);
}

function limparFormSaida() {
  document.getElementById('s-data').value = today();
  document.getElementById('s-projeto').value = '';
  ['s-data','s-projeto'].forEach(id => document.getElementById(id).classList.remove('error-field'));
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
        <div class="dev-title">
          <span class="chip ${st === 'Em atraso' ? 'chip-red' : ''}" style="margin-right:8px">${r.equipamento}</span>
          ${r.projeto || 'Sem projeto'}
          ${st === 'Em atraso' ? `<span class="badge atraso" style="margin-left:6px;font-size:10px;">⏱️ ${dias} dias</span>` : ''}
        </div>
        <div class="dev-meta">Técnico: ${r.tecnico} · Responsável: ${r.issak} · Saída: ${formatDate(r.data_saida)}</div>
      </div>
      <div class="dev-right">
        <button class="btn danger devolver" onclick="abrirModalDevolucao(${r.id})">Devolver</button>
      </div>
    </div>`;
  }).join('');
}

// ── Modal devolução ────────────────────────────────────────────────────────────
const MP_ENSAIOS = ['ph','orp','condutividade','od','temperatura'];
const MP_ENSAIOS_LABELS = { ph:'pH', orp:'ORP', condutividade:'Condutividade', od:'OD', temperatura:'Temperatura' };

function isMP(equipamento) {
  return (equipamento || '').toUpperCase().startsWith('MP-');
}

function abrirModalDevolucao(id) {
  const rec = records.find(r => r.id === id);
  if (!rec) return;
  modalRecordId = id;

  document.getElementById('modal-equip-info').innerHTML = `
    <div class="modal-equip-name">${rec.equipamento}</div>
    <div class="modal-equip-meta">Projeto: ${rec.projeto || '—'} · Técnico: ${rec.tecnico} · Saída: ${formatDate(rec.data_saida)}</div>
  `;

  // Reset checklist
  ['limpo','funcionando','kit'].forEach(k => {
    document.querySelector(`input[name="chk-${k}"][value="sim"]`).checked = false;
    document.querySelector(`input[name="chk-${k}"][value="nao"]`).checked = false;
    const just = document.getElementById(`just-${k}`);
    just.value = ''; just.style.display = 'none';
  });

  // Mostrar seção de ensaios correta
  const mp = isMP(rec.equipamento);
  document.getElementById('ensaios-mp-section').style.display   = mp ? 'block' : 'none';
  document.getElementById('ensaios-geral-section').style.display = mp ? 'none'  : 'none'; // outros não têm ensaios

  // Reset ensaios MP
  MP_ENSAIOS.forEach(e => {
    const sim = document.querySelector(`input[name="mp-${e}"][value="sim"]`);
    const nao = document.querySelector(`input[name="mp-${e}"][value="nao"]`);
    if (sim) sim.checked = false;
    if (nao) nao.checked = false;
    const just = document.getElementById(`just-mp-${e}`);
    if (just) { just.value = ''; just.style.display = 'none'; just.classList.remove('error-field'); }
  });

  // Reset ensaios geral
  ['sim','nao'].forEach(v => {
    const el = document.querySelector(`input[name="ensaios-flag"][value="${v}"]`);
    if (el) el.checked = false;
  });
  const devEnsaios = document.getElementById('dev-ensaios');
  const devJust    = document.getElementById('dev-ensaios-just');
  if (devEnsaios) { devEnsaios.value = ''; devEnsaios.classList.remove('error-field'); }
  if (devJust)    { devJust.value = '';    devJust.classList.remove('error-field'); }
  const simArea = document.getElementById('ensaios-sim-area');
  const naoArea = document.getElementById('ensaios-nao-area');
  if (simArea) simArea.style.display = 'none';
  if (naoArea) naoArea.style.display = 'none';

  // Limpar erros
  document.querySelectorAll('.modal-error').forEach(e => e.style.display = 'none');

  document.getElementById('modal-overlay').classList.add('open');
}

function onChecklistChange(item, valor) {
  const just = document.getElementById(`just-${item}`);
  just.style.display = valor === 'nao' ? 'block' : 'none';
  if (valor === 'sim') { just.value = ''; just.classList.remove('error-field'); }
  document.getElementById(`err-${item}`).style.display = 'none';
}

function onMpEnsaio(ensaio, valor) {
  const just = document.getElementById(`just-mp-${ensaio}`);
  just.style.display = valor === 'nao' ? 'block' : 'none';
  if (valor === 'sim') { just.value = ''; just.classList.remove('error-field'); }
  document.getElementById(`err-mp-${ensaio}`).style.display = 'none';
}

function onEnsaiosFlag(valor) {
  document.getElementById('ensaios-sim-area').style.display = valor === 'sim' ? 'block' : 'none';
  document.getElementById('ensaios-nao-area').style.display = valor === 'nao' ? 'block' : 'none';
  document.getElementById('dev-ensaios').value = '';
  document.getElementById('dev-ensaios-just').value = '';
  document.getElementById('err-ensaios').style.display = 'none';
}

function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  modalRecordId = null;
}
function closeModal(e) { if (e.target === document.getElementById('modal-overlay')) fecharModal(); }

async function confirmarDevolucao() {
  let valido = true;
  const rec = records.find(r => r.id === modalRecordId);

  // ── Checklist ──
  const checkItems = [
    { key: 'limpo', label: 'Equipamento Limpo' },
    { key: 'funcionando', label: 'Funcionando' },
    { key: 'kit', label: 'Kit Completo' }
  ];
  const checkResult = {};
  for (const item of checkItems) {
    const sel   = document.querySelector(`input[name="chk-${item.key}"]:checked`);
    const errEl = document.getElementById(`err-${item.key}`);
    if (!sel) { errEl.style.display = 'block'; valido = false; continue; }
    errEl.style.display = 'none';
    const just = document.getElementById(`just-${item.key}`).value.trim();
    if (sel.value === 'nao' && !just) {
      document.getElementById(`just-${item.key}`).classList.add('error-field'); valido = false;
    } else {
      document.getElementById(`just-${item.key}`).classList.remove('error-field');
    }
    checkResult[item.key] = { resposta: sel.value, justificativa: just };
  }

  // ── Ensaios ──
  let ensaiosTexto = 'N/A';

  if (isMP(rec.equipamento)) {
    // MP: validar todos os 5 ensaios obrigatoriamente
    const mpResult = {};
    for (const e of MP_ENSAIOS) {
      const sel   = document.querySelector(`input[name="mp-${e}"]:checked`);
      const errEl = document.getElementById(`err-mp-${e}`);
      if (!sel) { errEl.style.display = 'block'; valido = false; continue; }
      errEl.style.display = 'none';
      const just = document.getElementById(`just-mp-${e}`).value.trim();
      if (sel.value === 'nao' && !just) {
        document.getElementById(`just-mp-${e}`).classList.add('error-field'); valido = false;
      } else {
        document.getElementById(`just-mp-${e}`).classList.remove('error-field');
      }
      mpResult[e] = { resposta: sel.value, justificativa: just };
    }
    if (valido) {
      ensaiosTexto = MP_ENSAIOS.map(e => {
        const r = mpResult[e];
        if (!r) return '';
        const label = MP_ENSAIOS_LABELS[e];
        return r.resposta === 'sim'
          ? `${label}: ✓`
          : `${label}: ✗ (${r.justificativa})`;
      }).join(' | ');
    }
  }
  // outros equipamentos: sem campo de ensaios, ensaiosTexto = 'N/A'

  if (!valido) { showToast('Preencha todos os campos obrigatórios.', true); return; }

  const checklistStr = JSON.stringify(checkResult);

  setLoading(true);
  try {
    const dataRetorno = today();
    await sbPatch('registros', `id=eq.${modalRecordId}`, {
      data_retorno: dataRetorno,
      ensaios: ensaiosTexto,
      checklist: checklistStr
    });
    if (rec) { rec.data_retorno = dataRetorno; rec.ensaios = ensaiosTexto; rec.checklist = checklistStr; }
    fecharModal();
    renderDashboard();
    filtrarEmUso();
    showToast(`${rec?.equipamento} devolvido com sucesso.`);
  } catch(e) { showToast('Erro ao registrar devolução.', true); console.error(e); }
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
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="11"><div class="empty">Nenhum registro encontrado.</div></td></tr>'; return; }

  tbody.innerHTML = filtered.map(r => {
    const st   = getStatus(r);
    const dias = r.data_retorno ? diasEmUso(r.data_saida, r.data_retorno) : diasEmUso(r.data_saida);

    // Checklist badge
    let checkHtml = '—';
    if (r.checklist) {
      try {
        const chk = JSON.parse(r.checklist);
        const all = Object.values(chk).every(v => v.resposta === 'sim');
        checkHtml = all
          ? '<span class="badge devolvido">✓ OK</span>'
          : '<span class="badge atraso">⚠ Pendências</span>';
      } catch(e) {}
    }

    return `<tr>
      <td><span class="chip">${r.equipamento}</span></td>
      <td>${r.projeto || '—'}</td>
      <td>${r.tecnico}</td>
      <td>${r.issak || '—'}</td>
      <td>${formatDate(r.data_saida)}</td>
      <td>${formatDate(r.data_retorno)}</td>
      <td>${dias}</td>
      <td>${checkHtml}</td>
      <td class="ensaios-cell">${r.ensaios || '—'}</td>
      <td><span class="badge ${badgeClass(st)}">${st}</span></td>
      <td>${!r.data_retorno ? `<button class="btn danger devolver" onclick="abrirModalDevolucao(${r.id})">Devolver</button>` : ''}</td>
    </tr>`;
  }).join('');
}

// ── Export CSV ─────────────────────────────────────────────────────────────────
function exportarCSV() {
  const header = ['Equipamento','Projeto','Técnico','Responsável','Saída','Devolução','Dias','Checklist','Ensaios','Status'];
  const rows = records.map(r => {
    const dias = r.data_retorno ? diasEmUso(r.data_saida, r.data_retorno) : diasEmUso(r.data_saida);
    let chkResume = '';
    if (r.checklist) {
      try {
        const chk = JSON.parse(r.checklist);
        chkResume = Object.entries(chk).map(([k,v]) => `${k}:${v.resposta}${v.justificativa ? `(${v.justificativa})` : ''}`).join(' | ');
      } catch(e) {}
    }
    return [r.equipamento, r.projeto||'', r.tecnico, r.issak||'', formatDate(r.data_saida), formatDate(r.data_retorno), dias, chkResume, r.ensaios||'', getStatus(r)]
      .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
  });
  const csv  = [header.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = `equipamentos_${today()}.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exportado.');
}

// ── Cadastros ──────────────────────────────────────────────────────────────────
function renderCadastros() { renderEquipList(); renderFuncList(); }

function renderEquipList() {
  const list = document.getElementById('equip-list');
  const sorted = equipamentos.slice().sort((a,b) => a.codigo.localeCompare(b.codigo));
  if (!sorted.length) { list.innerHTML = '<div class="empty">Nenhum equipamento cadastrado.</div>'; return; }
  list.innerHTML = sorted.map(e => {
    const inUse  = records.some(r => r.equipamento === e.codigo && !r.data_retorno);
    const stCalib = statusCalibracao(e.validade_calibracao);
    const labelCalib = calibracaoLabel(e.validade_calibracao);
    let calibBadge = '';
    if (stCalib === 'vencido') calibBadge = `<span class="badge atraso" style="font-size:10px;">🔒 ${labelCalib}</span>`;
    else if (stCalib === 'alerta') calibBadge = `<span class="badge em-uso" style="font-size:10px;">⚠️ ${labelCalib}</span>`;
    else if (stCalib === 'ok') calibBadge = `<span class="badge devolvido" style="font-size:10px;">✓ ${labelCalib}</span>`;
    else calibBadge = `<span style="font-size:11px;color:var(--gray-400);">Sem calibração registrada</span>`;
    return `<div class="cad-item">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="cad-item-name">${e.codigo}</span>
          ${inUse ? '<span class="badge em-uso" style="font-size:10px;">Em uso</span>' : ''}
        </div>
        <div style="margin-top:4px;">${calibBadge}</div>
      </div>
      <div class="cad-actions">
        <button class="btn-icon edit" title="Editar" onclick="abrirEdicao('equip','${e.codigo.replace(/'/g,"\\'")}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon del" title="Remover" onclick="removerEquipamento('${e.codigo.replace(/'/g,"\\'")}')">
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
  const validade = document.getElementById('equip-validade').value || null;
  if (!val) { inp.classList.add('error-field'); showToast('Digite o código do equipamento.', true); return; }
  if (equipamentos.find(e => e.codigo === val)) { showToast(`${val} já cadastrado.`, true); return; }
  setLoading(true);
  try {
    await sbPost('equipamentos', { codigo: val, validade_calibracao: validade });
    equipamentos.push({ codigo: val, validade_calibracao: validade });
    refreshFormSelects(); renderEquipList();
    inp.value = ''; document.getElementById('equip-validade').value = ''; inp.classList.remove('error-field');
    showToast(`${val} adicionado.`);
  } catch(e) { showToast('Erro ao adicionar.', true); console.error(e); }
  setLoading(false);
}

async function removerEquipamento(codigo) {
  if (records.some(r => r.equipamento === codigo && !r.data_retorno)) { showToast(`${codigo} em uso, não pode remover.`, true); return; }
  if (!confirm(`Remover "${codigo}"?`)) return;
  setLoading(true);
  try {
    await sbDelete('equipamentos', `codigo=eq.${encodeURIComponent(codigo)}`);
    equipamentos = equipamentos.filter(e => e.codigo !== codigo);
    refreshFormSelects(); renderEquipList(); showToast(`${codigo} removido.`);
  } catch(e) { showToast('Erro ao remover.', true); console.error(e); }
  setLoading(false);
}

async function addFuncionario() {
  const inp = document.getElementById('func-input');
  const val = inp.value.trim();
  if (!val) { inp.classList.add('error-field'); showToast('Digite o nome.', true); return; }
  if (tecnicos.some(t => t.toLowerCase() === val.toLowerCase())) { showToast(`${val} já cadastrado.`, true); return; }
  setLoading(true);
  try {
    await sbPost('tecnicos', { nome: val });
    tecnicos.push(val); refreshFormSelects(); renderFuncList();
    inp.value = ''; inp.classList.remove('error-field'); showToast(`${val} adicionado.`);
  } catch(e) { showToast('Erro ao adicionar.', true); console.error(e); }
  setLoading(false);
}

async function removerFuncionario(nome) {
  if (records.some(r => r.tecnico === nome && !r.data_retorno)) { showToast(`${nome} tem equipamento em uso.`, true); return; }
  if (!confirm(`Remover "${nome}"?`)) return;
  setLoading(true);
  try {
    await sbDelete('tecnicos', `nome=eq.${encodeURIComponent(nome)}`);
    tecnicos = tecnicos.filter(t => t !== nome); refreshFormSelects(); renderFuncList(); showToast(`${nome} removido.`);
  } catch(e) { showToast('Erro ao remover.', true); console.error(e); }
  setLoading(false);
}

// ── Modal edição ───────────────────────────────────────────────────────────────
function abrirEdicao(type, oldValue) {
  editContext = { type, oldValue };
  document.getElementById('edit-title').textContent = type === 'equip' ? 'Editar equipamento' : 'Editar técnico';
  document.getElementById('edit-label').textContent = type === 'equip' ? 'Código do equipamento' : 'Nome do técnico';
  const inp = document.getElementById('edit-input');
  inp.value = oldValue; inp.classList.remove('error-field');
  const validadeRow = document.getElementById('edit-validade-row');
  if (type === 'equip') {
    validadeRow.style.display = 'flex';
    const eq = equipamentos.find(e => e.codigo === oldValue);
    document.getElementById('edit-validade').value = eq?.validade_calibracao || '';
  } else {
    validadeRow.style.display = 'none';
  }
  document.getElementById('edit-overlay').classList.add('open');
  setTimeout(() => inp.focus(), 100);
}

function fecharEditModal() { document.getElementById('edit-overlay').classList.remove('open'); editContext = null; }
function closeEditModal(e) { if (e.target === document.getElementById('edit-overlay')) fecharEditModal(); }

async function confirmarEdicao() {
  if (!editContext) return;
  const inp = document.getElementById('edit-input');
  let newVal = inp.value.trim();
  if (!newVal) { inp.classList.add('error-field'); showToast('Campo não pode ser vazio.', true); return; }
  if (editContext.type === 'equip') newVal = newVal.toUpperCase();
  const { type, oldValue } = editContext;
  const novaValidade = document.getElementById('edit-validade').value || null;
  setLoading(true);
  try {
    if (type === 'equip') {
      if (equipamentos.find(e => e.codigo === newVal) && newVal !== oldValue) { showToast(`${newVal} já existe.`, true); setLoading(false); return; }
      await sbPatch('equipamentos', `codigo=eq.${encodeURIComponent(oldValue)}`, { codigo: newVal, validade_calibracao: novaValidade });
      await sbPatch('registros', `equipamento=eq.${encodeURIComponent(oldValue)}`, { equipamento: newVal });
      const eq = equipamentos.find(e => e.codigo === oldValue);
      if (eq) { eq.codigo = newVal; eq.validade_calibracao = novaValidade; }
      records.forEach(r => { if (r.equipamento === oldValue) r.equipamento = newVal; });
      refreshFormSelects(); renderEquipList(); renderDashboard();
    } else {
      if (tecnicos.some(t => t.toLowerCase() === newVal.toLowerCase() && t !== oldValue)) { showToast(`${newVal} já existe.`, true); setLoading(false); return; }
      await sbPatch('tecnicos', `nome=eq.${encodeURIComponent(oldValue)}`, { nome: newVal });
      await sbPatch('registros', `tecnico=eq.${encodeURIComponent(oldValue)}`, { tecnico: newVal });
      tecnicos = tecnicos.map(t => t === oldValue ? newVal : t);
      records.forEach(r => { if (r.tecnico === oldValue) r.tecnico = newVal; });
      refreshFormSelects(); renderFuncList();
    }
    fecharEditModal(); showToast('Atualizado com sucesso.');
  } catch(e) { showToast('Erro ao atualizar.', true); console.error(e); }
  setLoading(false);
}

// ── Keyboard ───────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { fecharModal(); fecharEditModal(); }
});
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('equip-input').addEventListener('keydown', e => { if (e.key === 'Enter') addEquipamento(); });
  document.getElementById('func-input').addEventListener('keydown', e => { if (e.key === 'Enter') addFuncionario(); });
  document.getElementById('edit-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmarEdicao(); });
  pedirPermissaoNotificacao();
});

// ── Init ───────────────────────────────────────────────────────────────────────
document.getElementById('s-data').value = today();
loadAll();
