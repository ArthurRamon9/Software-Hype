// Escalas das sextas: uma tabela por ministério, no mesmo jeito da planilha que o pessoal já usa
// (colunas = sextas do mês, um bloco por função, os nomes um embaixo do outro).
// Todo mundo vê as escalas de todos; só o líder do ministério (ou administrador) altera.
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, sessao } from '../api.js';
import { esc, $, icon, aviso, avisoErro, janela, confirmar, isoLocal, semAcento } from '../ui.js';
import { baixarXLSX } from '../xlsx.js';

let mes = null;              // 'AAAA-MM'
let minSel = null;           // ministério aberto

const maiusc = (t) => t.replace(/^./, (c) => c.toUpperCase());
const nomeMes = (m) => maiusc(new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
const dia2 = (iso) => iso.slice(8, 10);
const diaMes = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const somaMes = (m, n) => { const d = new Date(`${m}-15T12:00:00`); d.setMonth(d.getMonth() + n); return isoLocal(d).slice(0, 7); };
// "Aline de Lima" -> "Aline Lima" (para o texto do WhatsApp)
const LIGA = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
const curto = (nome) => { const p = nome.trim().split(/\s+/).filter((w) => !LIGA.has(w.toLowerCase())); return p.slice(0, 2).join(' '); };
function sextasDoMes(m) {
  const d = new Date(`${m}-01T12:00:00`); const out = [];
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  while (isoLocal(d).slice(0, 7) === m) { out.push(isoLocal(d)); d.setDate(d.getDate() + 7); }
  return out;
}
const proximaSexta = () => { const d = new Date(); d.setHours(12, 0, 0, 0); while (d.getDay() !== 5) d.setDate(d.getDate() + 1); return isoLocal(d); };
// "+ Agenda" de uma escala: Google Agenda já preenchido (sexta, 19h às 22h)
const linkGoogle = (data, titulo) => `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: titulo, dates: `${data.replace(/-/g, '')}T190000/${data.replace(/-/g, '')}T220000`, ctz: 'America/Sao_Paulo' })}`;

export async function render(conteudo) {
  mes = mes || proximaSexta().slice(0, 7);
  const [dados, minhas] = await Promise.all([api('GET', `/escalas?mes=${mes}`), api('GET', '/escalas/minhas')]);
  const sextas = sextasDoMes(mes);
  const prox = proximaSexta();
  const eu = sessao.usuario.pessoa_id;
  const meus = new Set((sessao.usuario.ministerios || []).map((m) => m.id));
  const recarregar = () => render(conteudo).catch(avisoErro);
  const nomeMin = (id) => dados.ministerios.find((m) => m.id === id)?.nome || 'outro ministério';

  // Ministérios que aparecem nas abas: os que têm escala ou funções, e os que eu monto
  const temEscala = (m) => m.funcoes.length || dados.itens.some((i) => i.ministerio_id === m.id);
  const abas = dados.ministerios.filter((m) => temEscala(m) || m.pode_editar);
  if (!abas.some((m) => m.id === minSel)) {
    minSel = (abas.find((m) => m.pode_editar) || abas.find((m) => meus.has(m.id)) || abas[0])?.id || null;
  }
  const m = abas.find((x) => x.id === minSel);

  // As minhas próximas sextas (de qualquer mês)
  const minhasHtml = minhas.vinculado && minhas.itens.length ? `<section class="minhas-faixa">
      <span class="rot">Você serve</span>
      ${minhas.itens.slice(0, 6).map((i) => `<a class="minha" href="${linkGoogle(i.data, `Escala ${i.ministerio}${i.funcao ? ` · ${i.funcao}` : ''}`)}" target="_blank" rel="noopener" title="Colocar no meu Google Agenda" style="--c:${esc(i.cor)}">
        <b>Sexta ${diaMes(i.data)}</b><span><i></i>${esc(i.ministerio)}${i.funcao ? ` · ${esc(i.funcao)}` : ''}</span>${icon('agenda')}</a>`).join('')}
    </section>` : '';

  const navMes = `<div class="nav-mes"><button class="btn sm icone" id="mes-ant" aria-label="Mês anterior">‹</button><b>${nomeMes(mes)}</b><button class="btn sm icone" id="mes-prox" aria-label="Próximo mês">›</button></div>`;

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Escalas</h1><p class="sub">Quem serve em cada sexta. Todos veem as escalas de todos os ministérios.</p></div>
      <div class="acoes">${navMes}</div></div>
    ${minhasHtml}
    ${abas.length ? `<div class="chips" id="abas-min">${abas.map((x) => `<button data-min="${x.id}" class="${x.id === minSel ? 'ativo' : ''}" style="--c:${esc(x.cor)}"><i></i>${esc(x.nome)}</button>`).join('')}</div>
      <div id="quadro"></div>`
      : '<div class="painel vazio"><b>Nenhuma escala ainda</b>Quando os líderes montarem as escalas dos ministérios, elas aparecem aqui.</div>'}`;

  $('#abas-min .ativo')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  $('#mes-ant').addEventListener('click', () => { mes = somaMes(mes, -1); recarregar(); });
  $('#mes-prox').addEventListener('click', () => { mes = somaMes(mes, 1); recarregar(); });
  conteudo.querySelectorAll('[data-min]').forEach((b) => b.addEventListener('click', () => { minSel = Number(b.dataset.min); recarregar(); }));
  if (!m) return;

  // ---------- A escala do ministério aberto ----------
  const funcoes = m.funcoes.map((f) => f.nome);
  // funções apagadas que ainda estão na escala continuam aparecendo
  dados.itens.filter((i) => i.ministerio_id === m.id && i.funcao && !funcoes.includes(i.funcao)).forEach((i) => { if (!funcoes.includes(i.funcao)) funcoes.push(i.funcao); });
  const temSemFuncao = dados.itens.some((i) => i.ministerio_id === m.id && !i.funcao);
  const blocos = funcoes.length ? [...funcoes.map((f) => ({ f, rot: f })), ...(temSemFuncao ? [{ f: '', rot: 'Sem função' }] : [])] : [{ f: null, rot: '' }];
  const naCelula = (data, f) => dados.itens.filter((i) => i.ministerio_id === m.id && i.data === data && (f === null || (i.funcao || '') === f));
  const emOutro = (pid, data) => [...new Set(dados.itens.filter((i) => i.pessoa_id === pid && i.data === data && i.ministerio_id !== m.id).map((i) => nomeMin(i.ministerio_id)))];
  const pode = m.pode_editar;

  const nome = (i, data) => {
    const o = emOutro(i.pessoa_id, data);
    return `<li class="${o.length ? 'conf' : ''} ${i.pessoa_id === eu ? 'eu' : ''}" title="${esc(i.nome)}${o.length ? ` · também na ${esc(o.join(' e '))} nesta sexta` : ''}"><span>${esc(i.nome)}</span>${o.length ? icon('alerta') : ''}</li>`;
  };
  const celula = (data, b) => {
    const l = naCelula(data, b.f);
    const passou = data < isoLocal(new Date());
    return `<div class="cel-esc ${pode ? 'editavel' : ''}" ${pode ? `data-data="${data}" data-f="${b.f === null ? '' : esc(b.f)}" data-todas="${b.f === null ? 1 : 0}" role="button" tabindex="0"` : ''}>
      ${l.length ? `<ul>${l.map((i) => nome(i, data)).join('')}</ul>` : `<span class="vazio-f">${passou ? '—' : 'A definir'}</span>`}
      ${pode ? `<span class="add">${icon('plus')}${l.length ? 'Alterar' : 'Escolher'}</span>` : ''}</div>`;
  };
  // Quem também serve em outro ministério na mesma sexta (agrupado por pessoa)
  const conflitosMes = [];
  sextas.forEach((s) => naCelula(s, null).forEach((i) => {
    const o = emOutro(i.pessoa_id, s); if (!o.length) return;
    let c = conflitosMes.find((x) => x.pessoa_id === i.pessoa_id && x.outros.join() === o.join());
    if (!c) conflitosMes.push(c = { pessoa_id: i.pessoa_id, nome: i.nome, outros: o, datas: [] });
    if (!c.datas.includes(s)) c.datas.push(s);
  }));
  const listaDatas = (d) => { const t = d.map(diaMes); return t.length === 1 ? `na sexta ${t[0]}` : `nas sextas ${t.slice(0, -1).join(', ')} e ${t.at(-1)}`; };
  const cabecaSexta = (s) => `<span class="sx">Sexta <b>${dia2(s)}</b>${s === prox ? '<small>Próxima</small>' : ''}</span>`;

  $('#quadro').innerHTML = `
    ${conflitosMes.length ? `<div class="aviso-conf">${icon('alerta')}<div>${conflitosMes.map((c) => `<b>${esc(c.nome)}</b> também está na ${esc(c.outros.join(' e '))} ${listaDatas(c.datas)}`).join('. ')}.${pode ? ' Pode manter, mas combine com o outro líder.' : ''}</div></div>` : ''}
    <section class="painel quadro-escala" style="--c:${esc(m.cor)}">
      <div class="quadro-topo">
        <div><h2><i></i>${esc(m.nome)}</h2><span class="muted small">${pode ? 'Você monta esta escala. Toque numa sexta para escolher quem serve; salva na hora.' : 'Só o líder do ministério altera esta escala.'}</span></div>
        <div class="acoes">
          ${pode ? '<button class="btn sm" id="funcoes">Funções</button>' : ''}
          ${pode ? `<button class="btn sm" id="texto">${icon('whats')} Texto para o grupo</button>` : ''}
          <button class="btn sm" id="planilha">Baixar planilha</button>
        </div>
      </div>
      <div class="tabela-wrap so-computador"><table class="tab-escala">
        <thead><tr>${sextas.map((s) => `<th class="${s === prox ? 'prox' : ''}">${cabecaSexta(s)}</th>`).join('')}</tr></thead>
        <tbody>${blocos.map((b) => `${b.rot ? `<tr class="banda"><th colspan="${sextas.length}">${esc(b.rot)}</th></tr>` : ''}
          <tr>${sextas.map((s) => `<td class="${s === prox ? 'prox' : ''}">${celula(s, b)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <div class="esc-cel so-mobile">${sextas.map((s) => `<div class="esc-dia ${s === prox ? 'prox' : ''}"><h3>${cabecaSexta(s)}</h3>
        ${blocos.map((b) => `<div class="esc-bloco">${b.rot ? `<span class="fn">${esc(b.rot)}</span>` : ''}${celula(s, b)}</div>`).join('')}</div>`).join('')}</div>
      ${pode && !m.funcoes.length ? '<p class="rodape-quadro">Sem funções, a escala é só a lista de quem serve. Para separar (ex.: Entrada, Saída), crie funções no botão "Funções".</p>' : ''}
    </section>`;

  $('#planilha').addEventListener('click', () => baixarXLSX(`escala-${semAcento(m.nome).replace(/\s+/g, '-').toLowerCase()}-${mes}`, [{
    nome: 'Escala', linhas: [['', ...sextas.map((s) => `Sexta ${diaMes(s)}`)],
      ...blocos.flatMap((b) => {
        const cols = sextas.map((s) => naCelula(s, b.f).map((i) => i.nome));
        const n = Math.max(1, ...cols.map((c) => c.length));
        return Array.from({ length: n }, (_, k) => [k === 0 ? (b.rot || 'Escalados') : '', ...cols.map((c) => c[k] || '')]);
      })],
  }]));
  if (!pode) return;

  // Escolher quem serve numa sexta (e função)
  const abrirCelula = (cel) => {
    const data = cel.dataset.data, todas = cel.dataset.todas === '1', funcao = todas ? null : cel.dataset.f;
    const atuais = new Set(naCelula(data, funcao).map((i) => i.pessoa_id));
    const membros = m.membros;
    janela({
      titulo: `${m.nome} · Sexta ${diaMes(data)}${funcao ? ` · ${funcao}` : ''}`,
      corpo: `<div style="display:grid;gap:10px">
        ${membros.length > 8 ? '<input class="input busca" id="cel-busca" type="search" placeholder="Buscar nome" autocomplete="off">' : ''}
        ${membros.length ? `<div class="lista-escolha" id="cel-lista">${membros.map((p) => { const o = emOutro(p.id, data); return `<label data-nome="${esc(p.nome)}"><input type="checkbox" value="${p.id}" ${atuais.has(p.id) ? 'checked' : ''}>
          <span><b>${esc(p.nome)}</b>${o.length ? `<small class="txt-alerta">Já está na ${esc(o.join(' e '))} nesta sexta</small>` : p.lider ? '<small>Líder</small>' : ''}</span></label>`; }).join('')}</div>`
          : `<p class="muted">Ninguém no ministério ${esc(m.nome)} ainda. Coloque a equipe em Ministérios.</p>`}
        <div class="janela-acoes" style="justify-content:space-between"><span class="muted small" id="cel-conta"></span><div style="display:flex;gap:8px"><button type="button" class="btn" data-fechar>Cancelar</button>${membros.length ? '<button type="button" class="btn primary" id="cel-ok">Salvar</button>' : ''}</div></div></div>`,
      aoAbrir: (j, fechar) => {
        const conta = () => { const n = j.querySelectorAll('#cel-lista input:checked').length; j.querySelector('#cel-conta').textContent = n ? `${n} escolhido${n === 1 ? '' : 's'}` : ''; };
        conta();
        j.querySelector('#cel-lista')?.addEventListener('change', conta);
        const busca = j.querySelector('#cel-busca');
        busca?.addEventListener('input', () => { const b = semAcento(busca.value); j.querySelectorAll('#cel-lista label').forEach((l) => { l.hidden = b && !semAcento(l.dataset.nome).includes(b); }); });
        j.querySelector('#cel-ok')?.addEventListener('click', async () => {
          const ids = [...j.querySelectorAll('#cel-lista input:checked')].map((c) => Number(c.value));
          try {
            await api('PUT', `/escalas/${m.id}/${data}`, todas ? { itens: ids.map((pessoa_id) => ({ pessoa_id })) } : { funcao, itens: ids.map((pessoa_id) => ({ pessoa_id })) });
            fechar(); aviso('Escala salva.'); recarregar();
          } catch (err) { avisoErro(err); }
        });
      },
    });
  };
  $('#quadro').querySelectorAll('.cel-esc.editavel').forEach((cel) => {
    cel.addEventListener('click', () => abrirCelula(cel));
    cel.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirCelula(cel); } });
  });

  // Funções do ministério (o líder cria, renomeia e apaga; nada vem pronto)
  $('#funcoes').addEventListener('click', () => janela({
    titulo: `Funções da ${m.nome}`,
    corpo: `<div style="display:grid;gap:12px">
      <p class="hint">Ex.: Entrada, Saída, Iluminação. Cada função vira um bloco na escala. Sem funções, a escala é só a lista de quem serve.</p>
      <div id="fn-lista" class="fn-lista">${m.funcoes.map((f) => `<div><input class="input" data-fn="${f.id}" value="${esc(f.nome)}" maxlength="60"><button class="btn sm icone danger" data-apagar="${f.id}" title="Apagar função">${icon('lixeira')}</button></div>`).join('') || '<p class="muted">Nenhuma função ainda.</p>'}</div>
      <form id="fn-nova" style="display:flex;gap:8px"><input class="input" id="fn-nome" placeholder="Nova função" maxlength="60"><button class="btn">Adicionar</button></form>
      <div class="janela-acoes"><button type="button" class="btn primary" data-fechar>Pronto</button></div></div>`,
    aoAbrir: (j) => {
      j.querySelector('#fn-nova').addEventListener('submit', async (e) => {
        e.preventDefault(); const nomeF = j.querySelector('#fn-nome').value.trim(); if (!nomeF) return;
        try { await api('POST', `/escalas/${m.id}/funcoes`, { nome: nomeF }); aviso('Função criada.'); j.querySelector('[data-fechar]').click(); } catch (err) { avisoErro(err); }
      });
      j.querySelectorAll('[data-fn]').forEach((inp) => inp.addEventListener('change', async () => {
        try { await api('PUT', `/escalas/funcoes/${inp.dataset.fn}`, { nome: inp.value }); aviso('Função renomeada.'); } catch (err) { avisoErro(err); }
      }));
      j.querySelectorAll('[data-apagar]').forEach((b) => b.addEventListener('click', async () => {
        if (!(await confirmar('Apagar esta função? As escalas já montadas continuam mostrando o nome dela.', { botao: 'Apagar', perigo: true }))) return;
        try { await api('DELETE', `/escalas/funcoes/${b.dataset.apagar}`); aviso('Função apagada.'); recarregar(); } catch (err) { avisoErro(err); }
      }));
    },
    aoFechar: () => recarregar(),
  }));

  // Texto pronto para colar no grupo do WhatsApp do ministério
  $('#texto').addEventListener('click', async () => {
    const t = [`*Escala ${m.nome} · ${nomeMes(mes)}*`, ...sextas.map((s) => {
      const l = blocos.map((b) => { const p = naCelula(s, b.f).map((i) => curto(i.nome)); return b.rot ? `_${b.rot}_: ${p.length ? p.join(', ') : 'A definir'}` : (p.length ? p.join(', ') : 'A definir'); });
      return `\n*Sexta ${diaMes(s)}*\n${l.join('\n')}`;
    })].join('\n');
    try { await navigator.clipboard.writeText(t); aviso('Texto copiado. Cole no grupo do ministério.'); } catch {}
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank', 'noopener');
  });
}
