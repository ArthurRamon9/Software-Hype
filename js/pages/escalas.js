// Escalas das sextas por ministério
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api } from '../api.js';
import { esc, $, icon, aviso, avisoErro, janela, confirmar, foto, isoLocal, parseISO, semAcento } from '../ui.js';
import { baixarXLSX } from '../xlsx.js';

let visao = null;            // 'sexta' | 'montar' | 'minhas'
let mes = null;              // 'AAAA-MM'
let sextaSel = null;         // 'AAAA-MM-DD'
let minSel = null;           // ministério que está sendo montado

const nomeMes = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const diaMes = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const somaMes = (m, n) => { const d = new Date(`${m}-15T12:00:00`); d.setMonth(d.getMonth() + n); return isoLocal(d).slice(0, 7); };
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
  const dados = await api('GET', `/escalas?mes=${mes}`);
  const editaveis = dados.ministerios.filter((m) => m.pode_editar);
  visao = visao || (editaveis.length ? 'montar' : 'sexta');
  if (visao === 'montar' && !editaveis.length) visao = 'sexta';
  const sextas = sextasDoMes(mes);
  if (!sextaSel || sextaSel.slice(0, 7) !== mes) sextaSel = sextas.find((s) => s >= isoLocal(new Date())) || sextas[0];
  if (!minSel || !editaveis.some((m) => m.id === minSel)) minSel = editaveis[0]?.id || null;

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Escalas</h1><p class="sub">${dados.ve_todas ? 'Quem serve em cada ministério. Todos os líderes veem as escalas de todos.' : 'As escalas dos seus ministérios.'}</p></div></div>
    <div class="abas" id="visoes" style="margin-bottom:14px">
      ${editaveis.length ? `<button data-v="montar" class="${visao === 'montar' ? 'ativo' : ''}">Montar escala</button>` : ''}
      <button data-v="sexta" class="${visao === 'sexta' ? 'ativo' : ''}">Por sexta</button>
      <button data-v="minhas" class="${visao === 'minhas' ? 'ativo' : ''}">Minhas escalas</button>
    </div>
    <div id="corpo-escala"></div>`;
  conteudo.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { visao = b.dataset.v; render(conteudo).catch(avisoErro); }));
  const corpo = $('#corpo-escala');
  const recarregar = () => render(conteudo).catch(avisoErro);
  const navMes = `<div style="display:flex;gap:6px;align-items:center"><button class="btn sm" id="mes-ant" aria-label="Mês anterior">‹</button><b class="mes-nome">${nomeMes(mes).replace(/^./, (c) => c.toUpperCase())}</b><button class="btn sm" id="mes-prox" aria-label="Próximo mês">›</button></div>`;
  const ligarNavMes = () => {
    $('#mes-ant')?.addEventListener('click', () => { mes = somaMes(mes, -1); sextaSel = null; recarregar(); });
    $('#mes-prox')?.addEventListener('click', () => { mes = somaMes(mes, 1); sextaSel = null; recarregar(); });
  };
  // Quem está em mais de um ministério numa sexta
  const conflitos = (data) => {
    const porPessoa = new Map();
    dados.itens.filter((i) => i.data === data).forEach((i) => { const s = porPessoa.get(i.pessoa_id) || { nome: i.nome, mins: new Set(), det: [] }; s.mins.add(i.ministerio_id); s.det.push(i); porPessoa.set(i.pessoa_id, s); });
    return [...porPessoa.entries()].filter(([, s]) => s.mins.size > 1);
  };
  const nomeMin = (id) => dados.ministerios.find((m) => m.id === id)?.nome || 'outro ministério';

  // ---------- Minhas escalas ----------
  if (visao === 'minhas') {
    const { vinculado, itens } = await api('GET', '/escalas/minhas');
    corpo.innerHTML = !vinculado ? '<div class="painel vazio"><b>Sua conta ainda não está ligada ao seu cadastro</b>Peça a um administrador para ligar em Acessos. Aí aparecem aqui as sextas em que você serve.</div>'
      : itens.length ? `<section class="painel"><div class="painel-corpo minhas">${itens.map((i) => `<div><div class="dia"><b>${Number(i.data.slice(8, 10))}</b><span>${parseISO(i.data).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></div>
          <div class="cresce"><b>${esc(i.ministerio)}${i.funcao ? ` · ${esc(i.funcao)}` : ''}</b><span>${parseISO(i.data).toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase())}</span></div>
          <a class="btn sm" href="${linkGoogle(i.data, `Escala ${i.ministerio}${i.funcao ? ` · ${i.funcao}` : ''}`)}" target="_blank" rel="noopener" title="Colocar no meu Google Agenda">+ Agenda</a></div>`).join('')}</div></section>`
        : '<div class="painel vazio"><b>Nenhuma escala por enquanto</b>Quando o líder do seu ministério montar a escala, as suas sextas aparecem aqui.</div>';
    return;
  }

  // ---------- Por sexta (visão geral) ----------
  if (visao === 'sexta') {
    const conf = conflitos(sextaSel);
    const confIds = new Set(conf.map(([id]) => id));
    const cartao = (m) => {
      const itens = dados.itens.filter((i) => i.ministerio_id === m.id && i.data === sextaSel);
      const funcoes = [...m.funcoes.map((f) => f.nome), ...new Set(itens.map((i) => i.funcao).filter((f) => f && !m.funcoes.some((x) => x.nome === f)))];
      const pessoa = (i) => `<span class="quem ${confIds.has(i.pessoa_id) ? 'conf' : ''}">${foto(i.nome, null)}${esc(i.nome)}${confIds.has(i.pessoa_id) ? ` <small>Também em ${esc(conf.find(([id]) => id === i.pessoa_id)[1].det.filter((d) => d.ministerio_id !== m.id).map((d) => nomeMin(d.ministerio_id)).join(', '))}</small>` : ''}</span>`;
      const linhas = funcoes.length
        ? funcoes.map((f) => { const l = itens.filter((i) => i.funcao === f); return `<div class="esc-lin"><span class="fn">${esc(f)}</span><div>${l.length ? l.map(pessoa).join('') : '<span class="vazio-f">Ninguém ainda</span>'}</div></div>`; }).join('')
          + (itens.some((i) => !i.funcao) ? `<div class="esc-lin"><span class="fn">Sem função</span><div>${itens.filter((i) => !i.funcao).map(pessoa).join('')}</div></div>` : '')
        : `<div class="esc-lin sem-funcao"><div>${itens.length ? itens.map(pessoa).join('') : '<span class="vazio-f">Ninguém escalado ainda</span>'}</div></div>`;
      return `<section class="painel"><div class="painel-corpo esc-min" style="--c:${esc(m.cor)}"><h3><i></i>${esc(m.nome)}</h3>${linhas}</div></section>`;
    };
    const mostrar = dados.ministerios.filter((m) => m.funcoes.length || dados.itens.some((i) => i.ministerio_id === m.id && i.data === sextaSel));
    corpo.innerHTML = `
      <div class="painel" style="margin-bottom:14px"><div class="filtros" style="justify-content:space-between">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${sextas.map((s) => `<button class="btn sm ${s === sextaSel ? 'primary' : ''}" data-sexta="${s}">Sexta ${diaMes(s)}</button>`).join('')}</div>
        ${navMes}</div></div>
      ${conf.length ? `<div class="aviso-conf">${icon('alerta')}<div><b>${conf.length === 1 ? '1 pessoa está' : `${conf.length} pessoas estão`} em mais de um ministério nesta sexta:</b> ${conf.map(([, s]) => `${esc(s.nome)} (${[...s.mins].map(nomeMin).map(esc).join(' e ')})`).join('; ')}.</div></div>` : ''}
      ${mostrar.length ? `<div class="esc-sexta">${mostrar.map(cartao).join('')}</div>`
        : '<div class="painel vazio"><b>Nenhuma escala nesta sexta</b>Quando os líderes montarem as escalas, elas aparecem aqui.</div>'}`;
    corpo.querySelectorAll('[data-sexta]').forEach((b) => b.addEventListener('click', () => { sextaSel = b.dataset.sexta; recarregar(); }));
    ligarNavMes();
    return;
  }

  // ---------- Montar escala (líder) ----------
  const m = editaveis.find((x) => x.id === minSel);
  const linhas = m.funcoes.length ? m.funcoes.map((f) => f.nome) : [null];
  // funções que existem na escala mas foram apagadas continuam aparecendo
  dados.itens.filter((i) => i.ministerio_id === m.id && i.funcao && !linhas.includes(i.funcao)).forEach((i) => linhas.push(i.funcao));
  const naCelula = (data, funcao) => dados.itens.filter((i) => i.ministerio_id === m.id && i.data === data && (funcao === null ? true : i.funcao === funcao));
  const emOutro = (pid, data) => dados.itens.filter((i) => i.pessoa_id === pid && i.data === data && i.ministerio_id !== m.id).map((i) => nomeMin(i.ministerio_id));
  const chip = (i, data) => { const o = emOutro(i.pessoa_id, data); return `<span class="chip ${o.length ? 'conf2' : ''}" ${o.length ? `title="Também em ${esc(o.join(', '))} nesta sexta"` : ''}>${foto(i.nome, null)}${esc(i.nome)}${o.length ? ` ${icon('alerta')}` : ''}</span>`; };
  const conflitosMes = sextas.flatMap((s) => naCelula(s, null).filter((i) => emOutro(i.pessoa_id, s).length).map((i) => ({ ...i, outros: emOutro(i.pessoa_id, s) })));

  corpo.innerHTML = `
    <div class="painel" style="margin-bottom:14px"><div class="filtros" style="justify-content:space-between">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${editaveis.length > 1 ? `<select class="input" id="min-sel" style="width:auto">${editaveis.map((x) => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>` : `<b>${esc(m.nome)}</b>`}
        ${navMes}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn sm" id="funcoes">Funções</button>
        <button class="btn sm" id="texto">${icon('whats')} Texto para o grupo</button>
        <button class="btn sm" id="planilha">Baixar planilha</button>
      </div></div></div>
    ${conflitosMes.length ? `<div class="aviso-conf">${icon('alerta')}<div>${conflitosMes.map((c) => `<b>${esc(c.nome)}</b> já está em ${esc(c.outros.join(', '))} na sexta ${diaMes(c.data)}`).join('. ')}. Você pode manter, mas combine com o outro líder.</div></div>` : ''}
    <section class="painel"><div class="tabela-wrap"><table class="grade-escala">
      <thead><tr><th>${m.funcoes.length ? 'Função' : ''}</th>${sextas.map((s) => `<th>Sexta ${diaMes(s)}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map((f) => `<tr><td class="fn">${f === null ? 'Escalados' : esc(f)}${f !== null && !m.funcoes.some((x) => x.nome === f) ? ' <span class="muted small">(função apagada)</span>' : ''}</td>
        ${sextas.map((s) => `<td><div class="celula" data-data="${s}" data-funcao="${f === null ? '' : esc(f)}" data-semfuncao="${f === null ? 1 : 0}">${naCelula(s, f).map((i) => chip(i, s)).join('')}<button class="add" type="button">${icon('plus')} Escolher</button></div></td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <div class="filtros" style="border-top:1px solid var(--line);border-bottom:0"><span class="muted small">${m.funcoes.length ? `Funções da ${esc(m.nome)}: ${m.funcoes.map((f) => esc(f.nome)).join(', ')}.` : `A ${esc(m.nome)} não tem funções: a escala é só a lista de quem serve. Se quiser, crie funções no botão "Funções".`} Cada alteração é salva na hora.</span></div></section>`;

  $('#min-sel')?.addEventListener('change', (e) => { minSel = Number(e.target.value); recarregar(); });
  ligarNavMes();

  // Escolher quem serve numa célula (sexta + função)
  corpo.querySelectorAll('.celula').forEach((cel) => cel.addEventListener('click', () => {
    const data = cel.dataset.data, semFuncao = cel.dataset.semfuncao === '1', funcao = semFuncao ? null : cel.dataset.funcao;
    const atuais = new Set(naCelula(data, funcao).map((i) => i.pessoa_id));
    const membros = m.membros;
    janela({
      titulo: `${m.nome} · Sexta ${diaMes(data)}${funcao ? ` · ${funcao}` : ''}`,
      corpo: `<div style="display:grid;gap:10px">
        ${membros.length > 8 ? '<input class="input busca" id="cel-busca" type="search" placeholder="Buscar nome" autocomplete="off">' : ''}
        ${membros.length ? `<div class="lista-escolha" id="cel-lista">${membros.map((p) => { const o = emOutro(p.id, data); return `<label data-nome="${esc(p.nome)}"><input type="checkbox" value="${p.id}" ${atuais.has(p.id) ? 'checked' : ''}>
          <span><b>${esc(p.nome)}</b>${o.length ? `<small class="txt-alerta">Já está em ${esc(o.join(', '))} nesta sexta</small>` : p.lider ? '<small>Líder</small>' : ''}</span></label>`; }).join('')}</div>`
          : `<p class="muted">Ninguém no ministério ${esc(m.nome)} ainda. Coloque a equipe em Ministérios.</p>`}
        <div class="janela-acoes"><button type="button" class="btn" data-fechar>Cancelar</button>${membros.length ? '<button type="button" class="btn primary" id="cel-ok">Salvar</button>' : ''}</div></div>`,
      aoAbrir: (j, fechar) => {
        const busca = j.querySelector('#cel-busca');
        busca?.addEventListener('input', () => { const b = semAcento(busca.value); j.querySelectorAll('#cel-lista label').forEach((l) => { l.hidden = b && !semAcento(l.dataset.nome).includes(b); }); });
        j.querySelector('#cel-ok')?.addEventListener('click', async () => {
          const ids = [...j.querySelectorAll('#cel-lista input:checked')].map((c) => Number(c.value));
          try {
            await api('PUT', `/escalas/${m.id}/${data}`, semFuncao ? { itens: ids.map((pessoa_id) => ({ pessoa_id })) } : { funcao, itens: ids.map((pessoa_id) => ({ pessoa_id })) });
            fechar(); aviso('Escala salva.'); recarregar();
          } catch (err) { avisoErro(err); }
        });
      },
    });
  }));

  // Funções do ministério (o líder cria, renomeia e apaga; nada vem pronto)
  $('#funcoes').addEventListener('click', () => janela({
    titulo: `Funções da ${m.nome}`,
    corpo: `<div style="display:grid;gap:12px">
      <p class="hint">Ex.: Projeção, Som, Câmera. Sem funções, a escala é só a lista de quem serve em cada sexta.</p>
      <div id="fn-lista" class="fn-lista">${m.funcoes.map((f) => `<div><input class="input" data-fn="${f.id}" value="${esc(f.nome)}" maxlength="60"><button class="btn sm icone danger" data-apagar="${f.id}" title="Apagar função">${icon('lixeira')}</button></div>`).join('') || '<p class="muted">Nenhuma função ainda.</p>'}</div>
      <form id="fn-nova" style="display:flex;gap:8px"><input class="input" id="fn-nome" placeholder="Nova função" maxlength="60"><button class="btn">Adicionar</button></form>
      <div class="janela-acoes"><button type="button" class="btn primary" data-fechar>Pronto</button></div></div>`,
    aoAbrir: (j) => {
      j.querySelector('#fn-nova').addEventListener('submit', async (e) => {
        e.preventDefault(); const nome = j.querySelector('#fn-nome').value.trim(); if (!nome) return;
        try { await api('POST', `/escalas/${m.id}/funcoes`, { nome }); aviso('Função criada.'); j.querySelector('[data-fechar]').click(); recarregar(); } catch (err) { avisoErro(err); }
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
  const textoEscala = () => [`*Escala ${m.nome} · ${nomeMes(mes)}*`, ...sextas.map((s) => {
    const l = linhas.map((f) => { const p = naCelula(s, f).map((i) => i.nome.split(' ').slice(0, 2).join(' ')); return f === null ? (p.length ? p.join(', ') : 'A definir') : `${f}: ${p.length ? p.join(', ') : 'A definir'}`; });
    return `\n*Sexta ${diaMes(s)}*\n${l.join('\n')}`;
  })].join('\n');
  $('#texto').addEventListener('click', async () => {
    const t = textoEscala();
    try { await navigator.clipboard.writeText(t); aviso('Texto copiado. Cole no grupo do ministério.'); } catch {}
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank', 'noopener');
  });
  $('#planilha').addEventListener('click', () => baixarXLSX(`escala-${semAcento(m.nome).replace(/\s+/g, '-')}-${mes}`, [{
    nome: 'Escala', linhas: [[m.funcoes.length ? 'Função' : '', ...sextas.map((s) => `Sexta ${diaMes(s)}`)],
      ...linhas.map((f) => [f === null ? 'Escalados' : f, ...sextas.map((s) => naCelula(s, f).map((i) => i.nome).join(', '))])],
  }]));
}

