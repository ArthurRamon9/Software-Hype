// Escalas das sextas: uma tabela por ministério, no mesmo jeito da planilha que o pessoal já usa
// (colunas = sextas do mês, um bloco por função, os nomes um embaixo do outro).
// Todo mundo vê as escalas de todos; só o líder do ministério (ou administrador) altera.
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, sessao, pode as podeGeral } from '../api.js';
import { esc, $, icon, aviso, avisoErro, janela, confirmar, isoLocal, semAcento, ocupado } from '../ui.js';
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
  const vagasDe = (nomeF) => m.funcoes.find((x) => x.nome === nomeF)?.vagas || null;
  const blocos = funcoes.length ? [...funcoes.map((f) => ({ f, rot: f, vagas: vagasDe(f) })), ...(temSemFuncao ? [{ f: '', rot: 'Sem função' }] : [])] : [{ f: null, rot: '' }];
  const naCelula = (data, f) => dados.itens.filter((i) => i.ministerio_id === m.id && i.data === data && (f === null || (i.funcao || '') === f));
  const emOutro = (pid, data) => [...new Set(dados.itens.filter((i) => i.pessoa_id === pid && i.data === data && i.ministerio_id !== m.id).map((i) => nomeMin(i.ministerio_id)))];
  const pode = m.pode_editar;
  const podeBaixar = podeGeral('relatorios.exportar');

  const nome = (i, data) => {
    const o = emOutro(i.pessoa_id, data);
    return `<li class="${o.length ? 'conf' : ''} ${i.pessoa_id === eu ? 'eu' : ''}" title="${esc(i.nome)}${o.length ? ` · também na ${esc(o.join(' e '))} nesta sexta` : ''}"><span>${esc(i.nome)}</span>${o.length ? icon('alerta') : ''}</li>`;
  };
  // Função com quantidade (ex.: Entrada 3): mostra as vagas, preenchidas ou não
  const celula = (data, b) => {
    const l = naCelula(data, b.f);
    const passou = data < isoLocal(new Date());
    const faltam = b.vagas ? Math.max(0, b.vagas - l.length) : 0;
    const vazias = Array.from({ length: faltam }, () => `<li class="vaga">${passou ? '—' : 'Vaga'}</li>`).join('');
    return `<div class="cel-esc ${pode ? 'editavel' : ''}" ${pode ? `data-data="${data}" data-f="${b.f === null ? '' : esc(b.f)}" data-todas="${b.f === null ? 1 : 0}" role="button" tabindex="0"` : ''}>
      ${l.length || vazias ? `<ul>${l.map((i) => nome(i, data)).join('')}${vazias}</ul>` : `<span class="vazio-f">${passou ? '—' : 'A definir'}</span>`}
      ${pode ? `<span class="add">${icon('plus')}${l.length ? 'Alterar' : 'Escolher'}${b.vagas ? ` <em>${l.length}/${b.vagas}</em>` : ''}</span>` : ''}</div>`;
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
          <button class="btn sm" id="texto">${icon('whats')} Enviar para o grupo</button>
          ${pode || podeBaixar ? '<button class="btn sm" id="planilha">Baixar planilha</button>' : ''}
        </div>
      </div>
      <div class="tabela-wrap so-computador"><table class="tab-escala">
        <thead><tr>${sextas.map((s) => `<th class="${s === prox ? 'prox' : ''}">${cabecaSexta(s)}</th>`).join('')}</tr></thead>
        <tbody>${blocos.map((b) => `${b.rot ? `<tr class="banda"><th colspan="${sextas.length}">${esc(b.rot)}${b.vagas ? ` <span>${b.vagas} por sexta</span>` : ''}</th></tr>` : ''}
          <tr>${sextas.map((s) => `<td class="${s === prox ? 'prox' : ''}">${celula(s, b)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <div class="esc-cel so-mobile">${sextas.map((s) => `<div class="esc-dia ${s === prox ? 'prox' : ''}"><h3>${cabecaSexta(s)}</h3>
        ${blocos.map((b) => `<div class="esc-bloco">${b.rot ? `<span class="fn">${esc(b.rot)}${b.vagas ? ` · ${b.vagas}` : ''}</span>` : ''}${celula(s, b)}</div>`).join('')}</div>`).join('')}</div>
      ${pode && !m.funcoes.length ? '<p class="rodape-quadro">Sem funções, a escala é só a lista de quem serve. Para separar (ex.: Entrada, Saída), crie funções no botão "Funções".</p>' : ''}
    </section>`;

  $('#planilha')?.addEventListener('click', () => baixarXLSX(`escala-${semAcento(m.nome).replace(/\s+/g, '-').toLowerCase()}-${mes}`, [{
    nome: 'Escala', linhas: [['', ...sextas.map((s) => `Sexta ${diaMes(s)}`)],
      ...blocos.flatMap((b) => {
        const cols = sextas.map((s) => naCelula(s, b.f).map((i) => i.nome));
        const n = Math.max(1, ...cols.map((c) => c.length));
        return Array.from({ length: n }, (_, k) => [k === 0 ? (b.rot || 'Escalados') : '', ...cols.map((c) => c[k] || '')]);
      })],
  }]));
  // Enviar para o grupo: imagem da escala (no estilo do Hype) e o texto organizado para o WhatsApp
  $('#texto').addEventListener('click', () => enviarParaGrupo({ m, sextas, blocos, naCelula, prox }));
  if (!pode) return;

  // Escolher quem serve numa sexta (e função)
  const abrirCelula = (cel) => {
    const data = cel.dataset.data, todas = cel.dataset.todas === '1', funcao = todas ? null : cel.dataset.f;
    const atuais = new Set(naCelula(data, funcao).map((i) => i.pessoa_id));
    const membros = m.membros;
    const vagas = funcao ? vagasDe(funcao) : null;
    janela({
      titulo: `${m.nome} · Sexta ${diaMes(data)}${funcao ? ` · ${funcao}` : ''}`,
      corpo: `<div style="display:grid;gap:10px">
        ${membros.length > 8 ? '<input class="input busca" id="cel-busca" type="search" placeholder="Buscar nome" autocomplete="off">' : ''}
        ${membros.length ? `<div class="lista-escolha" id="cel-lista">${membros.map((p) => { const o = emOutro(p.id, data); return `<label data-nome="${esc(p.nome)}"><input type="checkbox" value="${p.id}" ${atuais.has(p.id) ? 'checked' : ''}>
          <span><b>${esc(p.nome)}</b>${o.length ? `<small class="txt-alerta">Já está na ${esc(o.join(' e '))} nesta sexta</small>` : p.lider ? '<small>Líder</small>' : ''}</span></label>`; }).join('')}</div>`
          : `<p class="muted">Ninguém no ministério ${esc(m.nome)} ainda. Coloque a equipe em Ministérios.</p>`}
        <div class="janela-acoes" style="justify-content:space-between"><span class="muted small" id="cel-conta"></span><div style="display:flex;gap:8px"><button type="button" class="btn" data-fechar>Cancelar</button>${membros.length ? '<button type="button" class="btn primary" id="cel-ok">Salvar</button>' : ''}</div></div></div>`,
      aoAbrir: (j, fechar) => {
        const conta = () => {
          const n = j.querySelectorAll('#cel-lista input:checked').length, el = j.querySelector('#cel-conta');
          el.textContent = vagas ? `${n} de ${vagas}${n > vagas ? ' (passou do combinado)' : ''}` : n ? `${n} escolhido${n === 1 ? '' : 's'}` : '';
          el.classList.toggle('txt-alerta', !!vagas && n > vagas);
        };
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

  // Funções do ministério: o líder cria quantas quiser, com a quantidade de pessoas de cada uma,
  // e só grava quando clica em Salvar (fechar sem salvar pergunta antes)
  $('#funcoes').addEventListener('click', () => {
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
          if (apagadas.length && !(await confirmar(`Tirar ${apagadas.map((f) => `"${f.nome}"`).join(', ')}? As escalas já montadas continuam mostrando o nome.`, { botao: 'Tirar e salvar', perigo: true }))) return;
          await ocupado(e.submitter, async () => {
            try { await api('PUT', `/escalas/${m.id}/funcoes`, { funcoes }); aviso('Funções salvas.'); fechar(); recarregar(); } catch (err) { avisoErro(err); }
          });
        });
      },
    });
  });

}

const dd = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
function montarEscala({ m, blocos, naCelula, prox }, datas) {
  return datas.map((s) => ({ iso: s, data: dd(s), prox: s === prox,
    blocos: blocos.map((b) => ({ rot: b.rot, vagas: b.vagas || 0, nomes: naCelula(s, b.f).map((i) => curto(i.nome)) })) }));
}
function textoWhats(m, titulo, sx) {
  const l = [`*ESCALA · ${m.nome.toUpperCase()}*`, `_${titulo}_`];
  for (const s of sx) {
    l.push('', `*Sexta, ${s.data}*${s.prox ? ' (próxima)' : ''}`);
    for (const b of s.blocos) {
      if (b.rot) l.push(`*${b.rot}*`);
      b.nomes.forEach((n) => l.push(`• ${n}`));
      const faltam = Math.max(0, b.vagas - b.nomes.length);
      if (faltam) l.push(`• _${faltam === 1 ? '1 vaga em aberto' : `${faltam} vagas em aberto`}_`);
      if (!b.nomes.length && !faltam) l.push('• _A definir_');
    }
  }
  return l.join('\n');
}

function enviarParaGrupo(ctx) {
  const { m, sextas, prox } = ctx;
  const nomeArq = (sufixo) => `escala-${semAcento(m.nome).replace(/\s+/g, '-').toLowerCase()}-${sufixo}.png`;
  let escolha = sextas.includes(prox) ? prox : 'mes';
  let arquivo = null, texto = '', geracao = 0;
  const podeCompartilhar = (f) => { try { return !!navigator.canShare?.({ files: [f] }); } catch { return false; } };
  janela({
    titulo: 'Enviar para o grupo',
    larga: true,
    avisarAoSair: false,
    corpo: `<div class="enviar-escala">
      <div class="abas" id="ee-qual"><button data-q="mes" class="${escolha === 'mes' ? 'ativo' : ''}">Mês</button>${sextas.map((s) => `<button data-q="${s}" class="${escolha === s ? 'ativo' : ''}" title="Só a sexta ${dd(s)}">${dd(s)}</button>`).join('')}</div>
      <div class="ee-previa" id="ee-previa"><div class="boot"><span class="spin"></span></div></div>
      <div class="ee-acoes">
        <button class="btn primary" id="ee-compartilhar" hidden>${icon('whats')} Compartilhar</button>
        <button class="btn" id="ee-baixar">Baixar imagem</button>
        <button class="btn" id="ee-copiar" hidden>Copiar imagem</button>
        <button class="btn" id="ee-texto">Copiar texto</button>
      </div>
      <p class="hint" id="ee-dica"></p>
    </div>`,
    aoAbrir: (j) => {
      const previa = j.querySelector('#ee-previa');
      const bComp = j.querySelector('#ee-compartilhar'), bCopiar = j.querySelector('#ee-copiar');
      const gerar = async () => {
        const minha = ++geracao;
        const datas = escolha === 'mes' ? sextas : [escolha];
        const sx = montarEscala(ctx, datas);
        const titulo = escolha === 'mes' ? nomeMes(mes) : `Sexta, ${diaMes(escolha)}`;
        texto = textoWhats(m, titulo, sx);
        const cv = await desenharEscala({ ministerio: m.nome, cor: m.cor, subtitulo: escolha === 'mes' ? nomeMes(mes) : `Sexta-feira, ${dd(escolha)}`,
          sextas: sx, rodape: `Atualizada em ${dd(isoLocal(new Date()))}` });
        const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
        if (minha !== geracao || !blob) return;
        arquivo = new File([blob], nomeArq(escolha === 'mes' ? mes : escolha), { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        previa.innerHTML = `<img src="${url}" alt="Imagem da escala ${esc(m.nome)}">`;
        previa.querySelector('img').addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
        const comp = podeCompartilhar(arquivo);
        bComp.hidden = !comp;
        bCopiar.hidden = comp || !(window.ClipboardItem && navigator.clipboard?.write);
        j.querySelector('#ee-baixar').classList.toggle('primary', !comp);
        j.querySelector('#ee-dica').textContent = comp
          ? 'Toque em "Compartilhar" e escolha o grupo no WhatsApp.'
          : 'Baixe ou copie a imagem e cole no grupo do WhatsApp (no WhatsApp Web, Ctrl+V cola a imagem).';
      };
      j.querySelector('#ee-qual').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-q]'); if (!b || b.dataset.q === escolha) return;
        escolha = b.dataset.q; previa.classList.add('gerando'); gerar().catch(avisoErro).finally(() => previa.classList.remove('gerando'));
      });
      bComp.addEventListener('click', async () => {
        try { await navigator.share({ files: [arquivo], text: texto }); } catch (e) {
          if (e?.name === 'AbortError') return;
          try { await navigator.share({ files: [arquivo] }); } catch (e2) { if (e2?.name !== 'AbortError') avisoErro(e2); }
        }
      });
      j.querySelector('#ee-baixar').addEventListener('click', () => {
        if (!arquivo) return;
        const a = document.createElement('a'); a.href = URL.createObjectURL(arquivo); a.download = arquivo.name;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        aviso('Imagem baixada. Agora é só mandar no grupo.');
      });
      bCopiar.addEventListener('click', async () => {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': arquivo })]); aviso('Imagem copiada. Cole no grupo do WhatsApp.'); }
        catch { aviso('Não deu para copiar a imagem neste navegador. Use "Baixar imagem".', 'erro'); }
      });
      j.querySelector('#ee-texto').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(texto); aviso('Texto copiado. Cole no grupo do ministério.'); }
        catch { window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener'); }
      });
      gerar().catch(avisoErro);
    },
  });
}
