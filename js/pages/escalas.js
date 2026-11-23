// Escalas das sextas: uma tabela por ministério, no mesmo jeito da planilha que o pessoal já usa
// (colunas = sextas do mês, um bloco por função, os nomes um embaixo do outro).
// Todo mundo vê as escalas de todos; só o líder do ministério (ou administrador) altera.
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, sessao, pode as podeGeral } from '../api.js';
import { esc, $, icon, aviso, avisoErro, janela, confirmar, isoLocal, semAcento, ocupado, menuAcoes } from '../ui.js';
import { ENG } from './engajamento.js';
import { abrirWhatsApp, ehCelular } from '../whats.js';
import { baixarXLSX } from '../xlsx.js';
import { desenharEscala } from '../escala-imagem.js';

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

  // Ministérios que aparecem nas abas: os que têm alguém escalado no mês (só funções criadas não contam) e os que eu monto
  const temEscala = (m) => dados.itens.some((i) => i.ministerio_id === m.id);
  const abas = dados.ministerios.filter((m) => temEscala(m) || m.pode_editar);
  if (!abas.some((m) => m.id === minSel)) {
    minSel = (abas.find((m) => m.pode_editar) || abas.find((m) => meus.has(m.id)) || abas[0])?.id || null;
  }
  const m = abas.find((x) => x.id === minSel);

  // As minhas próximas sextas (de qualquer mês)
  const hoje = isoLocal(new Date());
  minhas.itens = minhas.itens.filter((i) => i.data >= hoje);   // a sexta que passou some da faixa
  const minhasHtml = minhas.vinculado && minhas.itens.length ? `<section class="minhas-faixa">
      <span class="rot">Suas próximas escalas</span>
      ${minhas.itens.slice(0, 6).map((i) => `<span class="minha" style="--c:${esc(i.cor)}">
        <button type="button" class="minha-abrir" data-ir-min="${i.ministerio_id}" data-ir-mes="${i.data.slice(0, 7)}" title="Ver esta escala"><b>Sexta ${diaMes(i.data)}</b><span><i></i>${esc(i.ministerio)}${i.funcao ? ` · ${esc(i.funcao)}` : ''}</span></button>
        <a class="minha-agenda" href="${linkGoogle(i.data, `Escala ${i.ministerio}${i.funcao ? ` · ${i.funcao}` : ''}`)}" target="_blank" rel="noopener" title="Colocar no meu Google Agenda (lembrete)" aria-label="Colocar no meu Google Agenda">${icon('agendaMais')}</a></span>`).join('')}
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
  // Clicar numa das minhas escalas abre o ministério e o mês dela
  conteudo.querySelectorAll('[data-ir-min]').forEach((b) => b.addEventListener('click', () => { minSel = Number(b.dataset.irMin); mes = b.dataset.irMes; recarregar(); }));
  conteudo.querySelectorAll('[data-min]').forEach((b) => b.addEventListener('click', () => { minSel = Number(b.dataset.min); recarregar(); }));
  if (!m) return;

  // ---------- A escala do ministério aberto ----------
  const funcoes = m.funcoes.map((f) => f.nome);
  // funções apagadas que ainda estão na escala continuam aparecendo
  dados.itens.filter((i) => i.ministerio_id === m.id && i.funcao && !funcoes.includes(i.funcao)).forEach((i) => { if (!funcoes.includes(i.funcao)) funcoes.push(i.funcao); });
  const temSemFuncao = dados.itens.some((i) => i.ministerio_id === m.id && !i.funcao);
  const vagasDe = (nomeF) => m.funcoes.find((x) => x.nome === nomeF)?.vagas || null;
  const blocos = funcoes.length ? [...funcoes.map((f) => ({ f, rot: f, vagas: vagasDe(f) })), ...(temSemFuncao ? [{ f: '', rot: 'Sem função' }] : [])] : [{ f: null, rot: '' }];
  const naCelula = (data, f) => dados.itens.filter((i) => i.ministerio_id === m.id && i.data === data && (f === null || (i.funcao || '') === f));
  const emOutro = (pid, data) => [...new Set(dados.itens.filter((i) => i.pessoa_id === pid && i.data === data && i.ministerio_id !== m.id).map((i) => nomeMin(i.ministerio_id)))];
  const pode = m.pode_editar;
  const podeBaixar = podeGeral('relatorios.exportar');

  const nome = (i, data) => {
    const o = emOutro(i.pessoa_id, data);
    const part = i.engajamento ? ` part e-${i.engajamento}` : '';
    return `<li class="${o.length ? 'conf' : ''} ${i.pessoa_id === eu ? 'eu' : ''}${part}" title="${esc(i.nome)}${part ? ` · ${ENG[i.engajamento].rot}` : ''}${o.length ? ` · também na ${esc(o.join(' e '))} nesta sexta` : ''}">${part ? '<i class="bolinha"></i>' : ''}<span>${esc(i.nome)}</span>${o.length ? icon('alerta') : ''}</li>`;
  };
  // Função com quantidade (ex.: Entrada 3): mostra as vagas, preenchidas ou não
  const celula = (data, b) => {
    const l = naCelula(data, b.f);
    const passou = data < isoLocal(new Date());
    const faltam = b.vagas ? Math.max(0, b.vagas - l.length) : 0;
    const vazias = Array.from({ length: faltam }, () => `<li class="vaga">${passou ? '—' : 'Vaga'}</li>`).join('');
    return `<div class="cel-esc ${pode ? 'editavel' : ''}" ${pode ? `data-data="${data}" role="button" tabindex="-1" title="Montar a sexta ${diaMes(data)}"` : ''}>
      ${l.length || vazias ? `<ul>${l.map((i) => nome(i, data)).join('')}${vazias}</ul>` : `<span class="vazio-f">${passou ? '—' : 'A definir'}</span>`}
</div>`;
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
  const cabecaSexta = (s) => `<span class="sx">Sexta <b>${dia2(s)}</b>${s === prox ? '<small>Próxima</small>' : ''}</span>`
    + (pode ? `<button type="button" class="montar" data-montar="${s}" title="Escolher quem serve em cada função nesta sexta">${icon('lapis')}<span>Montar</span></button>` : '');
  const passadas = sextas.filter((s) => s <= hoje && naCelula(s, null).length);
  const temEngajamento = dados.itens.some((i) => i.ministerio_id === m.id && i.engajamento);
  const temAlguem = sextas.some((s) => naCelula(s, null).length);

  $('#quadro').innerHTML = `
    ${conflitosMes.length ? `<div class="aviso-conf">${icon('alerta')}<div>${conflitosMes.map((c) => `<b>${esc(c.nome)}</b> também está na ${esc(c.outros.join(' e '))} ${listaDatas(c.datas)}`).join('. ')}.${pode ? ' Pode manter, mas combine com o outro líder.' : ''}</div></div>` : ''}
    <section class="painel quadro-escala" style="--c:${esc(m.cor)}">
      <div class="quadro-topo">
        <div><h2><i></i>${esc(m.nome)}</h2><span class="muted small">${pode ? 'Você monta esta escala: toque em Montar (ou na sexta) para escolher quem serve.' : 'Só o líder do ministério altera esta escala.'}</span></div>
        <div class="acoes">
          ${temAlguem ? `<button class="btn sm primary" id="texto">${icon('whats')} Enviar para o grupo</button>` : ''}
          ${pode || (podeBaixar && temAlguem) ? `<button class="btn sm icone" id="mais-esc" title="Mais opções" aria-label="Mais opções">${icon('mais')}</button>` : ''}
        </div>
      </div>
      <div class="tabela-wrap so-computador"><table class="tab-escala">
        <thead><tr>${sextas.map((s) => `<th class="${s === prox ? 'prox' : ''}">${cabecaSexta(s)}</th>`).join('')}</tr></thead>
        <tbody>${blocos.map((b) => `${b.rot ? `<tr class="banda"><th colspan="${sextas.length}">${esc(b.rot)}${b.vagas ? ` <span>${b.vagas} por sexta</span>` : ''}</th></tr>` : ''}
          <tr>${sextas.map((s) => `<td class="${s === prox ? 'prox' : ''}">${celula(s, b)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <div class="esc-cel so-mobile">${sextas.map((s) => `<div class="esc-dia ${s === prox ? 'prox' : ''}"><h3>${cabecaSexta(s)}</h3>
        ${blocos.map((b) => `<div class="esc-bloco">${b.rot ? `<span class="fn">${esc(b.rot)}${b.vagas ? ` · ${b.vagas}` : ''}</span>` : ''}${celula(s, b)}</div>`).join('')}</div>`).join('')}</div>
      ${pode && temEngajamento ? `<p class="rodape-quadro legenda-part">${Object.entries(ENG).map(([k, e]) => `<span class="part e-${k}"><i class="bolinha"></i>${e.curto}</span>`).join('')}<a class="link-btn small" href="#/engajamento?ver=relatorio">Ver o relatório</a></p>` : ''}
      ${pode && !m.funcoes.length ? '<p class="rodape-quadro">Sem funções, a escala é só a lista de quem serve. Para separar (ex.: Entrada, Saída), crie funções no botão "Funções".</p>' : ''}
    </section>`;

  const ctx = { m, sextas, blocos, naCelula, emOutro, recarregar, hoje };
  const baixarPlanilha = () => baixarXLSX(`escala-${semAcento(m.nome).replace(/\s+/g, '-').toLowerCase()}-${mes}`, [{
    nome: 'Escala', linhas: [['', ...sextas.map((s) => `Sexta ${diaMes(s)}`)],
      ...blocos.flatMap((b) => {
        const cols = sextas.map((s) => naCelula(s, b.f).map((i) => i.nome));
        const n = Math.max(1, ...cols.map((c) => c.length));
        return Array.from({ length: n }, (_, k) => [k === 0 ? (b.rot || 'Escalados') : '', ...cols.map((c) => c[k] || '')]);
      })],
  }]);
  // Enviar para o grupo: imagem da escala (no estilo do Hype) e o texto organizado para o WhatsApp
  $('#texto')?.addEventListener('click', () => enviarParaGrupo({ m, sextas, blocos, naCelula, prox }));
  const ultimaPassada = passadas.at(-1);
  if ($('#mais-esc')) menuAcoes($('#mais-esc'), [
    pode && { rot: 'Funções', ic: 'lapis', acao: () => abrirFuncoes() },
    pode && temAlguem && { rot: 'Copiar ou limpar sextas', ic: 'copiar', acao: () => copiarOuLimpar(ctx) },
    pode && ultimaPassada && { rot: 'Engajamento da sexta', ic: 'engajamento', href: `#/engajamento?min=${m.id}&data=${ultimaPassada}` },
    (pode || podeBaixar) && temAlguem && { rot: 'Baixar planilha', ic: 'planilha', acao: baixarPlanilha },
  ]);
  if (!pode) return;

  // Tocar numa sexta (ou no botão Montar) abre a sexta inteira para montar
  $('#quadro').querySelectorAll('.cel-esc.editavel').forEach((cel) => cel.addEventListener('click', () => montarSexta(ctx, cel.dataset.data)));
  $('#quadro').querySelectorAll('[data-montar]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); montarSexta(ctx, b.dataset.montar); }));

  // Funções do ministério: o líder cria quantas quiser, com a quantidade de pessoas de cada uma,
  // e só grava quando clica em Salvar (fechar sem salvar pergunta antes)
  function abrirFuncoes() {
    let linhas = m.funcoes.map((f) => ({ id: f.id, nome: f.nome, vagas: f.vagas || '' }));
    janela({
      titulo: `Funções da ${m.nome}`,
      corpo: `<form id="fn-form" style="display:grid;gap:12px">
        <p class="hint">Cada função vira um bloco na escala. Em "Pessoas" coloque quantas servem nela em cada sexta (ex.: Entrada 3, Saída 5); deixe em branco se varia. Sem funções, a escala é só a lista de quem serve.</p>
        <div class="fn-cab"><span>Função</span><span>Pessoas</span><span></span></div>
        <div id="fn-lista" class="fn-lista"></div>
        <button type="button" class="btn sm fn-add" id="fn-add">${icon('plus')} Adicionar função</button>
        <div class="janela-acoes rodape-acoes"><span class="muted small" id="fn-total"></span>
          <div class="dir-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div></div></form>`,
      aoAbrir: (j, fechar) => {
        const box = j.querySelector('#fn-lista');
        const ler = () => { linhas = [...box.querySelectorAll('.fn-linha')].map((l) => ({ id: l.dataset.id ? Number(l.dataset.id) : null, nome: l.querySelector('.fn-nome').value, vagas: l.querySelector('.fn-vagas').value })); };
        const pintar = (focar) => {
          box.innerHTML = linhas.map((f) => `<div class="fn-linha" ${f.id ? `data-id="${f.id}"` : ''}>
            <input class="input fn-nome" value="${esc(f.nome)}" maxlength="60" placeholder="Ex.: Entrada" aria-label="Nome da função">
            <input class="input fn-vagas" type="number" min="1" max="99" inputmode="numeric" value="${esc(String(f.vagas || ''))}" placeholder="—" aria-label="Quantas pessoas">
            <button type="button" class="btn-icone fn-tirar" title="Tirar esta função" aria-label="Tirar esta função">${icon('lixeira')}</button></div>`).join('')
            || '<p class="muted small fn-vazio">Nenhuma função. A escala fica sendo só a lista de quem serve.</p>';
          const total = linhas.reduce((t, f) => t + (Number(f.vagas) || 0), 0);
          j.querySelector('#fn-total').textContent = total ? `${total} pessoa${total === 1 ? '' : 's'} por sexta` : '';
          if (focar) box.querySelector('.fn-linha:last-child .fn-nome')?.focus();
        };
        pintar();
        box.addEventListener('input', () => { ler(); const total = linhas.reduce((t, f) => t + (Number(f.vagas) || 0), 0); j.querySelector('#fn-total').textContent = total ? `${total} pessoa${total === 1 ? '' : 's'} por sexta` : ''; });
        j.querySelector('#fn-add').addEventListener('click', () => { ler(); linhas.push({ id: null, nome: '', vagas: '' }); j.alterou = true; pintar(true); });
        box.addEventListener('click', (e) => {
          const b = e.target.closest('.fn-tirar'); if (!b) return;
          ler(); linhas.splice([...box.querySelectorAll('.fn-linha')].indexOf(b.closest('.fn-linha')), 1); j.alterou = true; pintar();
        });
        box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('fn-nome')) { e.preventDefault(); j.querySelector('#fn-add').click(); } });
        if (!linhas.length) j.querySelector('#fn-add').click();
        j.alterou = false;
        j.querySelector('#fn-form').addEventListener('submit', async (e) => {
          e.preventDefault(); ler();
          const funcoes = linhas.filter((f) => f.nome.trim()).map((f) => ({ id: f.id, nome: f.nome.trim(), vagas: f.vagas ? Number(f.vagas) : null }));
          const apagadas = m.funcoes.filter((f) => !funcoes.some((x) => x.id === f.id));
          const escalados = apagadas.filter((f) => dados.itens.some((i) => i.ministerio_id === m.id && i.funcao === f.nome && i.data >= hoje)).length;
          if (apagadas.length && !(await confirmar(`Tirar ${apagadas.map((f) => `"${f.nome}"`).join(', ')}?${escalados ? ' Quem estava escalado nela nas próximas sextas sai da escala.' : ''} As sextas que já passaram ficam como estão.`, { botao: 'Tirar e salvar', perigo: true }))) return;
          await ocupado(e.submitter, async () => {
            try { await api('PUT', `/escalas/${m.id}/funcoes`, { funcoes }); aviso('Funções salvas.'); fechar(); recarregar(); } catch (err) { avisoErro(err); }
          });
        });
      },
    });
  }

}

const dd = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Montar a sexta inteira numa janela só: cada pessoa da equipe com as funções lado a lado
function montarSexta({ m, naCelula, emOutro, recarregar }, data) {
  const funcoes = m.funcoes.map((f) => f.nome);
  // funções apagadas (ou "Sem função") que ainda têm gente nesta sexta também aparecem, para ninguém sumir ao salvar
  const extras = [...new Set(naCelula(data, null).map((i) => i.funcao || '').filter((f) => !funcoes.includes(f) && (f || funcoes.length)))];
  const cols = [...(funcoes.length ? funcoes : [null]), ...extras];
  const rotulo = (f) => (f === null ? 'Serve' : f || 'Sem função');
  const marcado = new Set(naCelula(data, null).map((i) => `${i.pessoa_id}|${i.funcao || ''}`));
  const vagas = Object.fromEntries(m.funcoes.map((f) => [f.nome, f.vagas]));
  janela({
    titulo: `${m.nome} · Sexta ${diaMes(data)}`,
    larga: cols.length > 2,
    corpo: `<div style="display:grid;gap:10px">
      ${m.membros.length > 8 ? '<input class="input busca" id="ms-busca" type="search" placeholder="Buscar nome" autocomplete="off">' : ''}
      ${m.membros.length ? `<div class="montar-sexta" id="ms-lista" style="--cols:${cols.length}">
        ${cols[0] !== null || cols.length > 1 ? `<div class="ms-cab"><span></span>${cols.map((f) => `<span>${esc(rotulo(f))}</span>`).join('')}</div>` : ''}
        ${m.membros.map((p) => { const o = emOutro(p.id, data); return `<div class="ms-linha" data-nome="${esc(p.nome)}"><span class="ms-nome"><b>${esc(p.nome)}</b>${o.length ? `<small class="txt-alerta">Na ${esc(o.join(' e '))} nesta sexta</small>` : ''}</span>
          ${cols.map((f) => `<label class="ms-op" title="${esc(rotulo(f))}"><input type="checkbox" data-p="${p.id}" data-f="${esc(f || '')}" ${marcado.has(`${p.id}|${f || ''}`) ? 'checked' : ''}><span>${esc(rotulo(f))}</span></label>`).join('')}</div>`; }).join('')}
      </div>` : `<p class="muted">Ninguém no ministério ${esc(m.nome)} ainda. Coloque a equipe em Ministérios.</p>`}
      <div class="janela-acoes" style="justify-content:space-between;flex-wrap:wrap"><span class="muted small" id="ms-conta"></span>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" id="ms-limpar">Desmarcar todos</button><button type="button" class="btn" data-fechar>Cancelar</button>${m.membros.length ? '<button type="button" class="btn primary" id="ms-ok">Salvar</button>' : ''}</div></div></div>`,
    aoAbrir: (j, fechar) => {
      const marcados = () => [...j.querySelectorAll('#ms-lista input:checked')];
      const conta = () => {
        const l = marcados();
        j.querySelector('#ms-conta').innerHTML = cols.length === 1 && cols[0] === null ? (l.length ? `${l.length} escolhido${l.length === 1 ? '' : 's'}` : '')
          : cols.map((f) => { const n = l.filter((c) => c.dataset.f === (f || '')).length, v = vagas[f]; return `<span class="${v && n > v ? 'txt-alerta' : ''}">${esc(rotulo(f))} ${n}${v ? `/${v}` : ''}</span>`; }).join(' · ');
      };
      conta();
      j.querySelector('#ms-lista')?.addEventListener('change', () => { j.alterou = true; conta(); });
      j.querySelector('#ms-limpar').addEventListener('click', () => { marcados().forEach((c) => { c.checked = false; }); j.alterou = true; conta(); });
      const busca = j.querySelector('#ms-busca');
      busca?.addEventListener('input', () => { const b = semAcento(busca.value); j.querySelectorAll('.ms-linha').forEach((l) => { l.hidden = b && !semAcento(l.dataset.nome).includes(b); }); });
      j.querySelector('#ms-ok')?.addEventListener('click', (e) => ocupado(e.currentTarget, async () => {
        const itens = marcados().map((c) => ({ pessoa_id: Number(c.dataset.p), funcao: c.dataset.f || null }));
        try { await api('PUT', `/escalas/${m.id}/${data}`, { itens }); fechar(true); aviso('Escala salva.'); recarregar(); } catch (err) { avisoErro(err); }
      }));
    },
  });
}

// Copiar uma sexta para as outras do mês, ou limpar sextas inteiras
function copiarOuLimpar({ m, sextas, naCelula, recarregar }) {
  const comGente = sextas.filter((s) => naCelula(s, null).length);
  const opcoes = (nome, marcar) => sextas.map((s) => `<label><input type="checkbox" name="${nome}" value="${s}" ${marcar(s) ? 'checked' : ''}><span><b>Sexta ${diaMes(s)}</b><small>${naCelula(s, null).length ? `${naCelula(s, null).length} na escala` : 'Vazia'}</small></span></label>`).join('');
  let de = comGente[0] || null;
  janela({
    titulo: `${m.nome} · Copiar ou limpar`,
    corpo: `<div class="abas" id="cl-modo"><button data-m="copiar" class="ativo">Copiar uma sexta</button><button data-m="limpar">Limpar sextas</button></div>
      <div id="cl-copiar" style="display:grid;gap:12px;margin-top:14px">
        ${comGente.length ? `<div class="field"><label for="cl-de">Copiar a escala de</label><select class="input" id="cl-de">${comGente.map((s) => `<option value="${s}">Sexta ${diaMes(s)} (${naCelula(s, null).length} pessoas)</option>`).join('')}</select></div>
        <div class="field"><label>Para as sextas</label><div class="lista-escolha curta" id="cl-para">${opcoes('para', () => false)}</div></div>
        <p class="hint">O que já estiver nas sextas escolhidas é trocado pela cópia. Depois é só ajustar quem não puder.</p>` : '<p class="muted">Monte uma sexta primeiro para poder copiar.</p>'}
      </div>
      <div id="cl-limpar" hidden style="display:grid;gap:12px;margin-top:14px">
        <div class="lista-escolha curta">${opcoes('limpar', () => false)}</div>
        <p class="hint">Tira todo mundo das sextas escolhidas, em todas as funções.</p>
      </div>
      <div class="janela-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button type="button" class="btn primary" id="cl-ok">Copiar</button></div>`,
    aoAbrir: (j, fechar) => {
      let modo = 'copiar';
      const ok = j.querySelector('#cl-ok');
      const sincronizar = () => {
        de = j.querySelector('#cl-de')?.value || null;
        j.querySelectorAll('#cl-para input').forEach((c) => { c.disabled = c.value === de; if (c.disabled) c.checked = false; });
      };
      sincronizar();
      j.querySelector('#cl-de')?.addEventListener('change', sincronizar);
      j.querySelector('#cl-modo').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-m]'); if (!b) return;
        modo = b.dataset.m;
        j.querySelectorAll('#cl-modo button').forEach((x) => x.classList.toggle('ativo', x === b));
        j.querySelector('#cl-copiar').hidden = modo !== 'copiar'; j.querySelector('#cl-limpar').hidden = modo !== 'limpar';
        ok.textContent = modo === 'copiar' ? 'Copiar' : 'Limpar'; ok.classList.toggle('danger', modo === 'limpar'); ok.classList.toggle('primary', modo === 'copiar');
      });
      ok.addEventListener('click', () => ocupado(ok, async () => {
        try {
          if (modo === 'copiar') {
            const para = [...j.querySelectorAll('#cl-para input:checked')].map((c) => c.value);
            if (!de || !para.length) return aviso('Escolha para quais sextas copiar.', 'erro');
            if (para.some((s) => naCelula(s, null).length) && !(await confirmar(`Trocar o que já está em ${para.filter((s) => naCelula(s, null).length).map(diaMes).join(', ')} pela escala de ${diaMes(de)}?`, { botao: 'Copiar' }))) return;
            await api('POST', `/escalas/${m.id}/copiar`, { de, para });
            aviso(`Escala de ${diaMes(de)} copiada.`);
          } else {
            const datas = [...j.querySelectorAll('#cl-limpar input:checked')].map((c) => c.value);
            if (!datas.length) return aviso('Escolha as sextas para limpar.', 'erro');
            if (!(await confirmar(`Tirar todo mundo da escala ${datas.length === 1 ? 'da sexta' : 'das sextas'} ${datas.map(diaMes).join(', ')}?`, { botao: 'Limpar', perigo: true }))) return;
            await api('POST', `/escalas/${m.id}/limpar`, { datas });
            aviso('Escala limpa.');
          }
          fechar(true); recarregar();
        } catch (err) { avisoErro(err); }
      }));
    },
  });
}

function montarEscala({ m, blocos, naCelula, prox }, datas) {
  return datas.map((s) => ({ iso: s, data: dd(s), prox: s === prox,
    blocos: blocos.map((b) => ({ rot: b.rot, vagas: b.vagas || 0, nomes: naCelula(s, b.f).map((i) => curto(i.nome)) })) }));
}
function enviarParaGrupo(ctx) {
  const { m, sextas, prox } = ctx;
  const nomeArq = (sufixo) => `escala-${semAcento(m.nome).replace(/\s+/g, '-').toLowerCase()}-${sufixo}.png`;
  let escolha = sextas.includes(prox) ? prox : 'mes';
  let arquivo = null, geracao = 0;
  const podeCompartilhar = (f) => { try { return !!navigator.canShare?.({ files: [f] }); } catch { return false; } };
  janela({
    titulo: 'Enviar para o grupo',
    larga: true,
    avisarAoSair: false,
    corpo: `<div class="enviar-escala">
      <div class="abas" id="ee-qual"><button data-q="mes" class="${escolha === 'mes' ? 'ativo' : ''}">Mês</button>${sextas.map((s) => `<button data-q="${s}" class="${escolha === s ? 'ativo' : ''}" title="Só a sexta ${dd(s)}">${dd(s)}</button>`).join('')}</div>
      <div class="ee-previa" id="ee-previa"><div class="boot"><span class="spin"></span></div></div>
      <div class="ee-acoes">
        <button class="btn primary" id="ee-compartilhar">${icon('whats')} Mandar no WhatsApp</button>
        <button class="btn" id="ee-nomes" title="Copia a lista de quem serve, para colar na mensagem">${icon('copiar')} Copiar os nomes</button>
        <button class="btn" id="ee-baixar">Baixar imagem</button>
      </div>
      <div class="ee-passos" id="ee-passos" hidden>
        <b>No WhatsApp que abriu:</b>
        <ol><li>Escolha o grupo: a escala já vai escrita</li><li id="ee-img">Quer a imagem junto? Ela já está copiada: na conversa, aperte <kbd>Ctrl</kbd> + <kbd>V</kbd></li></ol>
        <span class="muted small" id="ee-app"></span>
      </div>
      <p class="hint" id="ee-dica"></p>
    </div>`,
    aoAbrir: (j) => {
      const previa = j.querySelector('#ee-previa');
      const bComp = j.querySelector('#ee-compartilhar');
      const celular = ehCelular();
      const gerar = async () => {
        const minha = ++geracao;
        const datas = escolha === 'mes' ? sextas : [escolha];
        const sx = montarEscala(ctx, datas);
        const cv = await desenharEscala({ ministerio: m.nome, cor: m.cor, subtitulo: escolha === 'mes' ? nomeMes(mes) : `Sexta-feira, ${dd(escolha)}`,
          sextas: sx, rodape: `Atualizada em ${dd(isoLocal(new Date()))}` });
        const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
        if (minha !== geracao || !blob) return;
        arquivo = new File([blob], nomeArq(escolha === 'mes' ? mes : escolha), { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        previa.innerHTML = `<img src="${url}" alt="Imagem da escala ${esc(m.nome)}">`;
        previa.querySelector('img').addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
        j.querySelector('#ee-dica').textContent = celular && podeCompartilhar(arquivo)
          ? 'Escolha o WhatsApp e depois o grupo: a imagem e os nomes já vão juntos.'
          : 'O WhatsApp abre com a escala já escrita: é só escolher o grupo e enviar.';
      };
      j.querySelector('#ee-qual').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-q]'); if (!b || b.dataset.q === escolha) return;
        escolha = b.dataset.q; previa.classList.add('gerando'); gerar().catch(avisoErro).finally(() => previa.classList.remove('gerando'));
      });
      // Texto com quem serve (vai junto no celular; no computador, "Copiar os nomes")
      const texto = () => {
        const datas = escolha === 'mes' ? sextas : [escolha];
        return [`*Escala ${m.nome}* · ${escolha === 'mes' ? nomeMes(mes) : `Sexta ${dd(escolha)}`}`, ...montarEscala(ctx, datas).flatMap((sx) => [
          ...(datas.length > 1 ? ['', `*Sexta ${sx.data}*`] : ['']),
          ...sx.blocos.filter((b) => b.nomes.length).map((b) => `${b.rot ? `${b.rot}: ` : ''}${b.nomes.join(', ')}`),
        ])].join('\n');
      };
      const compartilhar = async () => {
        try { await navigator.share({ files: [arquivo], text: texto() }); }
        catch (e) {
          if (e?.name === 'AbortError') return;
          try { await navigator.share({ files: [arquivo] }); } catch (e2) { if (e2?.name !== 'AbortError') avisoErro(e2); }
        }
      };
      bComp.addEventListener('click', async () => {
        if (!arquivo) return;
        // No celular a lista de compartilhar do aparelho é o único jeito de a imagem ir junto (WhatsApp costuma ser o primeiro)
        if (celular && podeCompartilhar(arquivo)) return compartilhar();
        // No computador: igual à Agenda, o WhatsApp abre com a escala já escrita e a pessoa só escolhe o grupo.
        // A imagem fica copiada: se quiser mandar junto, é colar na conversa.
        let copiou = false;
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': arquivo })]); copiou = true; } catch {}
        abrirWhatsApp(texto());
        const passos = j.querySelector('#ee-passos');
        passos.querySelector('#ee-img').hidden = !copiou;
        passos.hidden = false;
        passos.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        // Windows com Chrome/Edge: dá para usar o WhatsApp instalado no computador (a imagem vai junto)
        const app = j.querySelector('#ee-app');
        if (podeCompartilhar(arquivo) && !app.firstChild) {
          app.innerHTML = 'Tem o WhatsApp instalado no computador? <button type="button" class="link-btn small" id="ee-app-btn">Mandar por ele</button>';
          app.querySelector('#ee-app-btn').addEventListener('click', compartilhar);
        }
      });
      j.querySelector('#ee-nomes').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(texto()); aviso('Nomes copiados. É só colar na mensagem.'); }
        catch { aviso('Não deu para copiar neste navegador.', 'erro'); }
      });
      j.querySelector('#ee-baixar').addEventListener('click', () => {
        if (!arquivo) return;
        const a = document.createElement('a'); a.href = URL.createObjectURL(arquivo); a.download = arquivo.name;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        aviso('Imagem baixada. Agora é só mandar no grupo.');
      });
      gerar().catch(avisoErro);
    },
  });
}
