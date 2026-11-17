// Presença semanal (encontros de sexta)
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { sb, ok, urlsFotos, isAdmin } from '../supabase.js';
import {
  icon, esc, $, $$, toast, toastErro, carregando, confirmar, modal, avatar, badgeTipo,
  isoLocal, parseISO, ultimaSexta, fmtData, hojeISO, TIPOS,
} from '../ui.js';
import { atualizarBadges, navegar } from '../app.js';
import { calcularAlertas } from './pastoral.js';

let dataSel = null;

export async function render(content) {
  if (!dataSel) dataSel = isoLocal(ultimaSexta());
  await desenhar(content);
  const aviso = (e) => { if (content.dataset.sujo === '1') { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', aviso);
  return () => window.removeEventListener('beforeunload', aviso);
}

async function desenhar(content) {
  const [encontro, pessoas] = await Promise.all([
    ok(await sb.from('encontros').select('*').eq('data', dataSel).maybeSingle()),
    ok(await sb.from('pessoas').select('id,nome,tipo,foto_path,cd_status,data_nascimento').order('nome')),
  ]);
  const registros = encontro ? ok(await sb.from('presencas').select('pessoa_id,presente,justificativa').eq('encontro_id', encontro.id)) : [];
  const marc = new Map(registros.map((r) => [r.pessoa_id, r.presente]));
  const justif = new Map(registros.filter((r) => r.justificativa).map((r) => [r.pessoa_id, r.justificativa]));
  const original = new Map(marc);
  // Ativos + inativos que já têm registro neste encontro
  let lista = pessoas.filter((p) => p.cd_status === 1 || marc.has(p.id));
  const fotos = await urlsFotos(lista.map((p) => p.foto_path));
  let busca = '', filtroTipo = '';
  content.dataset.sujo = '0';

  const d = parseISO(dataSel);
  const diaSemana = d.toLocaleDateString('pt-BR', { weekday: 'long' });

  content.innerHTML = `
    <div class="page-head">
      <div><h1>Presença</h1><p>Marque quem veio ao encontro. ${encontro ? '<span class="badge ok">Encontro já registrado</span>' : '<span class="badge">Novo encontro</span>'}</p></div>
      <div class="actions">
        ${encontro && isAdmin() ? `<button class="btn btn-ghost" id="del-enc">${icon('trash')}</button>` : ''}
        <button class="btn btn-ghost" id="add-vis">${icon('userPlus')} Visitante novo</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="att-head">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-ghost btn-icon" id="ant" title="Sexta anterior">‹</button>
          <input type="date" class="input" id="data" value="${dataSel}" style="width:auto">
          <button class="btn btn-ghost btn-icon" id="prox" title="Próxima sexta">›</button>
          <span class="muted small" style="text-transform:capitalize">${diaSemana}</span>
        </div>
        <div class="att-counters" id="cont"></div>
      </div>
      <div class="field" style="margin-top:14px"><input class="input" id="tema" placeholder="Tema / pregação do encontro (opcional)" value="${esc(encontro?.tema || '')}"></div>
    </div>

    <div class="toolbar">
      <div class="input-wrap grow">${icon('search')}<input class="input" id="busca" placeholder="Buscar pessoa..."></div>
      <select class="input" id="ftipo" style="width:auto"><option value="">Todos</option>
        ${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}s</option>`).join('')}</select>
      <button class="btn btn-ghost btn-sm" id="todos-p">Todos presentes</button>
      <button class="btn btn-ghost btn-sm" id="resto-f">Não marcados = falta</button>
    </div>

    <div class="att-list" id="lista"></div>

    <div class="sticky-save">
      <button class="btn btn-primary" id="salvar" style="min-width:220px">${icon('check')} Salvar presença</button>
    </div>`;

  const sujar = () => { content.dataset.sujo = '1'; };

  const contadores = () => {
    let p = 0, f = 0;
    lista.forEach((x) => { const v = marc.get(x.id); if (v === true) p++; else if (v === false) f++; });
    const n = lista.length - p - f;
    $('#cont').innerHTML = `<span class="badge ok">${icon('check')} ${p} presentes</span>
      <span class="badge bad">${icon('x')} ${f} faltas</span>${n ? `<span class="badge">${n} sem marcar</span>` : ''}`;
  };

  const linha = (p) => {
    const v = marc.get(p.id);
    const j = justif.get(p.id);
    return `<div class="att-row ${v === true ? 'is-p' : v === false ? 'is-f' : ''}" data-id="${p.id}">
      ${avatar(p.nome, fotos[p.foto_path], 'sm')}
      <div class="grow"><b>${esc(p.nome)}</b><span>${badgeTipo(p.tipo)}${j ? ` · ${esc(j)}` : ''}</span></div>
      <div class="att-toggle">
        ${v === false ? `<button data-j title="Justificativa">${icon('message')}</button>` : ''}
        <button data-v="1" class="${v === true ? 'on-p' : ''}" aria-label="Presente">${icon('check')}<span>Presente</span></button>
        <button data-v="0" class="${v === false ? 'on-f' : ''}" aria-label="Falta">${icon('x')}<span>Falta</span></button>
      </div></div>`;
  };

  const visiveis = () => {
    const b = busca.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return lista.filter((p) => (!filtroTipo || p.tipo === filtroTipo)
      && (!b || p.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(b)));
  };

  const pintar = () => {
    const v = visiveis();
    $('#lista').innerHTML = v.length ? v.map(linha).join('') : `<div class="card empty">${icon('users')}<p>Ninguém encontrado. Cadastre pessoas na aba Pessoas.</p></div>`;
    contadores();
  };
  pintar();

  $('#lista').addEventListener('click', async (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    const row = btn.closest('.att-row'); const pid = Number(row.dataset.id);
    if (btn.hasAttribute('data-j')) {
      modal({
        titulo: 'Justificativa da falta',
        corpo: `<textarea class="input" id="jtxt" placeholder="Ex.: viajando, doente, trabalho...">${esc(justif.get(pid) || '')}</textarea>
          <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="jok">Salvar</button></div>`,
        onOpen: (m, fechar) => {
          m.querySelector('#jtxt').focus();
          m.querySelector('#jok').onclick = () => {
            const t = m.querySelector('#jtxt').value.trim();
            if (t) justif.set(pid, t); else justif.delete(pid);
            sujar(); fechar(); row.outerHTML = linha(lista.find((x) => x.id === pid));
          };
        },
      });
      return;
    }
    const novo = btn.dataset.v === '1';
    if (marc.get(pid) === novo) marc.delete(pid); else marc.set(pid, novo);
    if (novo) justif.delete(pid);
    sujar();
    row.outerHTML = linha(lista.find((x) => x.id === pid));
    contadores();
  });

  $('#busca').addEventListener('input', (e) => { busca = e.target.value; pintar(); });
  $('#ftipo').addEventListener('change', (e) => { filtroTipo = e.target.value; pintar(); });
  $('#todos-p').onclick = () => { visiveis().forEach((p) => { marc.set(p.id, true); justif.delete(p.id); }); sujar(); pintar(); };
  $('#resto-f').onclick = () => { visiveis().forEach((p) => { if (!marc.has(p.id)) marc.set(p.id, false); }); sujar(); pintar(); };
  $('#tema').addEventListener('input', sujar);

  const trocarData = async (nova) => {
    if (content.dataset.sujo === '1' && !(await confirmar('Há alterações não salvas. Trocar de data mesmo assim?', { ok: 'Trocar' }))) {
      $('#data').value = dataSel; return;
    }
    dataSel = nova; content.innerHTML = '<div class="boot" style="min-height:40vh"><div class="spinner"></div></div>';
    try { await desenhar(content); } catch (e) { toastErro(e); }
  };
  const somar = (dias) => { const x = parseISO(dataSel); x.setDate(x.getDate() + dias); return isoLocal(x); };
  $('#data').addEventListener('change', (e) => e.target.value && trocarData(e.target.value));
  $('#ant').onclick = () => trocarData(somar(-7));
  $('#prox').onclick = () => trocarData(somar(7));

  // Visitante novo (cadastro rápido, já marcado como presente)
  $('#add-vis').onclick = () => modal({
    titulo: 'Cadastro rápido',
    corpo: `<form id="fv" class="grid" style="gap:14px">
      <div class="field"><label>Nome *</label><input class="input" id="vnome" required></div>
      <div class="field"><label>Telefone / WhatsApp</label><input class="input" id="vtel" type="tel"></div>
      <div class="field"><label>Data de nascimento</label><input class="input" id="vnasc" type="date" max="${hojeISO()}"></div>
      <div class="field"><label>Como conheceu o Hype?</label><input class="input" id="vcon" placeholder="Ex.: convite de amigo"></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Cadastrar e marcar presença</button></div>
      <p class="muted small" style="margin:0">Dá para completar o cadastro depois na aba Pessoas.</p></form>`,
    onOpen: (m, fechar) => {
      m.querySelector('#vnome').focus();
      m.querySelector('#fv').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const nome = m.querySelector('#vnome').value.trim();
        if (nome.length < 2) return toast('Informe o nome.', 'bad');
        await carregando(ev.submitter, async () => {
          try {
            const nova = ok(await sb.from('pessoas').insert({
              nome, tipo: 'visitante', telefone: m.querySelector('#vtel').value.trim() || null,
              data_nascimento: m.querySelector('#vnasc').value || null,
              como_conheceu: m.querySelector('#vcon').value.trim() || null, data_cadastro: dataSel,
            }).select('id,nome,tipo,foto_path,cd_status,data_nascimento').single());
            lista = [...lista, nova].sort((a, b) => a.nome.localeCompare(b.nome));
            marc.set(nova.id, true); sujar(); fechar(); pintar();
            toast(`${nome.split(' ')[0]} cadastrado(a) como visitante. Lembre de salvar!`);
          } catch (e) { toastErro(e); }
        });
      });
    },
  });

  // Excluir encontro
  $('#del-enc')?.addEventListener('click', async () => {
    if (!(await confirmar(`Excluir o encontro de ${fmtData(dataSel)} e todas as presenças marcadas nele?`, { ok: 'Excluir', perigo: true }))) return;
    try { ok(await sb.from('encontros').delete().eq('id', encontro.id)); toast('Encontro excluído.'); content.dataset.sujo = '0'; await desenhar(content); }
    catch (e) { toastErro(e); }
  });

  // Salvar
  $('#salvar').onclick = (e) => carregando(e.currentTarget, async () => {
    try {
      if (!marc.size) return toast('Marque pelo menos uma pessoa.', 'bad');
      const tema = $('#tema').value.trim() || null;
      const enc = ok(await sb.from('encontros').upsert({ data: dataSel, tema }, { onConflict: 'data' }).select('id').single());
      const linhas = [...marc].map(([pessoa_id, presente]) => ({
        encontro_id: enc.id, pessoa_id, presente, justificativa: presente ? null : (justif.get(pessoa_id) || null),
      }));
      ok(await sb.from('presencas').upsert(linhas, { onConflict: 'encontro_id,pessoa_id' }));
      const remover = [...original.keys()].filter((k) => !marc.has(k));
      if (remover.length) ok(await sb.from('presencas').delete().eq('encontro_id', enc.id).in('pessoa_id', remover));
      content.dataset.sujo = '0';
      original.clear(); marc.forEach((v, k) => original.set(k, v));
      const p = linhas.filter((l) => l.presente).length;
      toast(`Presença salva! ${p} presentes, ${linhas.length - p} faltas.`);

      // Avisa sobre jovens que entraram em alerta pastoral
      const alertas = await calcularAlertas();
      if (alertas.length) {
        modal({
          titulo: 'Atenção da Pastoral',
          corpo: `<p style="margin:0 0 12px;color:var(--text-2)">${alertas.length} ${alertas.length === 1 ? 'jovem está' : 'jovens estão'} com faltas seguidas e sem acompanhamento aberto:</p>
            <div class="list">${alertas.slice(0, 6).map((a) => `<div class="list-item">${avatar(a.pessoa.nome, null, 'sm')}<div class="grow"><b>${esc(a.pessoa.nome)}</b><span>${a.faltas} faltas seguidas</span></div></div>`).join('')}</div>
            <div class="modal-actions"><button class="btn btn-ghost" data-close>Depois</button><button class="btn btn-primary" id="ir-past">${icon('heart')} Ir para Pastoral</button></div>`,
          onOpen: (m, fechar) => { m.querySelector('#ir-past').onclick = () => { fechar(); navegar('/pastoral'); }; },
        });
      }
      atualizarBadges();
    } catch (err) { toastErro(err); }
  });
}
