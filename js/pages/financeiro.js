// Financeiro do Hype: verba do ano, despesas e entradas (ofertas, doações...), com o saldo sempre à vista
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, pode } from '../api.js';
import { esc, $, icon, aviso, avisoErro, ocupado, janela, confirmar, fmtData, hojeISO, semAcento } from '../ui.js';
import { baixarXLSX } from '../xlsx.js';

let ano = null;
let filtroTipo = '';
let busca = '';
let filtroCat = '';
const ordem = { col: 'data', dir: -1 };

const TIPOS = {
  despesa: { rotulo: 'Despesa', plural: 'Despesas', sinal: -1 },
  entrada: { rotulo: 'Entrada', plural: 'Entradas', sinal: 1 },
  verba: { rotulo: 'Verba', plural: 'Verba', sinal: 1 },
};
const real = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// "1.234,56" ou "1234.56" -> 1234.56
const lerValor = (t) => {
  const s = String(t || '').replace(/[^\d,.-]/g, '');
  if (!s) return NaN;
  return s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
};

export async function render(conteudo) {
  ano = ano || new Date().getFullYear();
  const { lancamentos, anos, categorias: cadastradas = [] } = await api('GET', `/financeiro?ano=${ano}`);
  const podeEditar = pode('financeiro.editar'), podeApagar = pode('acessos.gerenciar');
  const recarregar = () => render(conteudo).catch(avisoErro);
  const soma = (t) => lancamentos.filter((l) => l.tipo === t).reduce((s, l) => s + l.valor, 0);
  const verba = soma('verba'), entradas = soma('entrada'), gastos = soma('despesa');
  const saldo = verba + entradas - gastos;
  const usado = verba + entradas > 0 ? Math.min(100, Math.round((gastos / (verba + entradas)) * 100)) : 0;
  const anosLista = [...new Set([...anos, new Date().getFullYear(), ano])].sort((a, b) => b - a);
  const nomesCad = cadastradas.map((c) => c.nome);
  const categorias = [...new Set([...nomesCad, ...lancamentos.map((l) => l.categoria).filter(Boolean)])];
  // Gastos por categoria (para ver para onde o dinheiro foi)
  const porCat = Object.entries(lancamentos.filter((l) => l.tipo === 'despesa').reduce((m, l) => { const k = l.categoria || 'Sem categoria'; m[k] = (m[k] || 0) + l.valor; return m; }, {}))
    .sort((a, b) => b[1] - a[1]);
  const maiorCat = porCat[0]?.[1] || 1;

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Financeiro</h1><p class="sub">A verba do ano, o que entrou e o que foi gasto. O saldo se atualiza a cada lançamento.</p></div>
      <div class="acoes">
        <select class="input" id="fin-ano" style="width:auto" aria-label="Ano">${anosLista.map((a) => `<option value="${a}" ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
        ${podeEditar ? '<button class="btn" id="fin-cats">Categorias</button>' : ''}
        <button class="btn" id="fin-planilha">Baixar planilha</button>
        ${podeEditar ? `<button class="btn primary" id="fin-novo">${icon('plus')} Novo lançamento</button>` : ''}
      </div></div>
    <div class="numeros">
      <div><div class="rot">Verba de ${ano}</div><div class="val">${real(verba)}</div><div class="det">${lancamentos.filter((l) => l.tipo === 'verba').length ? 'Valor separado para o ano' : 'Lance a verba do ano para começar'}</div></div>
      <div><div class="rot">Entradas</div><div class="val">${real(entradas)}</div><div class="det">Ofertas, doações e outras entradas</div></div>
      <div><div class="rot">Gastos</div><div class="val">${real(gastos)}</div><div class="det"><div class="fin-barra" title="${usado}% do total já foi gasto"><i style="width:${usado}%"></i></div>${usado}% do que havia</div></div>
      <div class="${saldo < 0 ? 'fin-negativo' : ''}"><div class="rot">Saldo</div><div class="val">${real(saldo)}</div><div class="det">${saldo < 0 ? '<span class="desce">Gastou mais do que havia</span>' : 'Verba + entradas − gastos'}</div></div>
    </div>
    <div class="colunas c21 mt">
      <section class="painel">
        <div class="filtros" style="justify-content:space-between">
          <div class="abas" id="fin-tipos">${[['', 'Todos'], ['despesa', 'Despesas'], ['entrada', 'Entradas'], ['verba', 'Verba']].map(([k, r]) => `<button data-t="${k}" class="${filtroTipo === k ? 'ativo' : ''}">${r}</button>`).join('')}</div>
        </div>
        <div class="filtros">
          <input class="input busca" id="fin-busca" type="search" placeholder="Buscar descrição" value="${esc(busca)}">
          ${categorias.length ? `<select class="input" id="fin-cat" aria-label="Categoria"><option value="">Todas as categorias</option>${categorias.map((c) => `<option ${filtroCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
        </div>
        <div class="tabela-wrap"><table class="tabela fin-tabela">
          <thead><tr><th><button class="th-ordem" data-ordem="data">Data<span class="seta-ordem" data-seta="data"></span></button></th><th>Descrição</th><th class="some-mobile">Categoria</th>
            <th class="dir"><button class="th-ordem" data-ordem="valor">Valor<span class="seta-ordem" data-seta="valor"></span></button></th></tr></thead>
          <tbody id="fin-linhas"></tbody></table></div>
        <div class="filtros" style="border-top:1px solid var(--line);border-bottom:0"><span class="muted small" id="fin-total"></span></div>
      </section>
      <section class="painel">
        <div class="painel-topo"><h2>Para onde foi o dinheiro</h2><span class="sub">Gastos por categoria</span></div>
        <div class="painel-corpo">${porCat.length ? `<div class="fin-cats">${porCat.map(([c, v]) => `<div><span>${esc(c)}</span><b>${real(v)}</b><i style="width:${Math.max(4, Math.round((v / maiorCat) * 100))}%"></i></div>`).join('')}</div>`
          : '<div class="vazio" style="padding:18px 0"><b>Nenhum gasto ainda</b>Quando lançar uma despesa com categoria (ex.: Lanche), ela aparece aqui.</div>'}</div>
      </section>
    </div>`;

  const visiveis = () => {
    const b = semAcento(busca);
    return lancamentos.filter((l) => (!filtroTipo || l.tipo === filtroTipo) && (!filtroCat || l.categoria === filtroCat) && (!b || semAcento(`${l.descricao} ${l.categoria || ''}`).includes(b)))
      .sort((x, y) => ordem.dir * (ordem.col === 'valor' ? x.valor - y.valor : x.data.localeCompare(y.data) || x.id - y.id));
  };
  const pintar = () => {
    const l = visiveis();
    conteudo.querySelectorAll('[data-seta]').forEach((el) => { el.textContent = el.dataset.seta === ordem.col ? (ordem.dir > 0 ? ' ↑' : ' ↓') : ''; });
    const total = l.reduce((s, x) => s + TIPOS[x.tipo].sinal * x.valor, 0);
    $('#fin-total').textContent = `${l.length} lançamento${l.length === 1 ? '' : 's'}${l.length ? ` · ${total < 0 ? '−' : ''}${real(Math.abs(total))}` : ''}`;
    $('#fin-linhas').innerHTML = l.length ? l.map((x) => `<tr class="${podeEditar ? 'clicavel' : ''}" data-id="${x.id}">
        <td class="small" style="white-space:nowrap">${fmtData(x.data)}</td>
        <td><b>${esc(x.descricao)}</b><span class="fin-tipo t-${x.tipo}">${TIPOS[x.tipo].rotulo}</span></td>
        <td class="some-mobile muted small">${esc(x.categoria || '')}</td>
        <td class="dir num fin-valor t-${x.tipo}">${x.tipo === 'despesa' ? '−' : '+'}${real(x.valor)}</td></tr>`).join('')
      : `<tr><td colspan="4" class="vazio">${lancamentos.length ? 'Nada com esses filtros.' : `<b>Nenhum lançamento em ${ano}</b>${podeEditar ? 'Comece lançando a verba do ano em "Novo lançamento".' : ''}`}</td></tr>`;
  };
  pintar();

  $('#fin-ano').addEventListener('change', (e) => { ano = Number(e.target.value); recarregar(); });
  conteudo.querySelectorAll('#fin-tipos [data-t]').forEach((b) => b.addEventListener('click', () => { filtroTipo = b.dataset.t; pintar(); }));
  $('#fin-busca').addEventListener('input', (e) => { busca = e.target.value; pintar(); });
  $('#fin-cat')?.addEventListener('change', (e) => { filtroCat = e.target.value; pintar(); });
  conteudo.querySelectorAll('[data-ordem]').forEach((b) => b.addEventListener('click', () => {
    if (ordem.col === b.dataset.ordem) ordem.dir *= -1; else { ordem.col = b.dataset.ordem; ordem.dir = -1; }
    pintar();
  }));
  $('#fin-novo')?.addEventListener('click', () => editar(null, nomesCad, recarregar, podeApagar));
  $('#fin-cats')?.addEventListener('click', () => editarCategorias(cadastradas, recarregar));
  $('#fin-linhas').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr || !podeEditar) return;
    editar(lancamentos.find((x) => x.id === Number(tr.dataset.id)), nomesCad, recarregar, podeApagar);
  });
  $('#fin-planilha').addEventListener('click', () => baixarXLSX(`financeiro-hype-${ano}`, [
    { nome: 'Resumo', semFiltro: true, linhas: [[`Financeiro ${ano}`, 'Valor'], ['Verba', verba], ['Entradas', entradas], ['Gastos', gastos], ['Saldo', saldo]] },
    { nome: 'Lançamentos', linhas: [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Lançado por'],
      ...[...lancamentos].sort((x, y) => x.data.localeCompare(y.data)).map((x) => [x.data, TIPOS[x.tipo].rotulo, x.descricao, x.categoria || '', TIPOS[x.tipo].sinal * x.valor, x.criado_por_nome || ''])] },
    ...(porCat.length ? [{ nome: 'Gastos por categoria', linhas: [['Categoria', 'Gasto'], ...porCat.map(([c, v]) => [c, v])], grafico: { titulo: `Gastos por categoria em ${ano}`, tipo: 'barra', categoria: 0, series: [1], rotulos: true } }] : []),
  ]));
}

// ---------- Novo / corrigir lançamento ----------
function editar(l, categorias, depois, podeApagar) {
  const novo = !l;
  let tipo = l?.tipo || 'despesa';
  janela({
    titulo: novo ? 'Novo lançamento' : 'Corrigir lançamento',
    corpo: `<form id="ff" style="display:grid;gap:14px">
      <div class="field"><span class="label">O que é</span>
        <div class="abas fin-escolha" id="ff-tipo">${Object.entries(TIPOS).map(([k, t]) => `<button type="button" data-t="${k}" class="${tipo === k ? 'ativo' : ''}">${t.rotulo}</button>`).join('')}</div>
        <span class="hint" id="ff-dica"></span></div>
      <div class="form-r">
        <div class="field"><label for="ff-valor">Valor (R$) *</label><input class="input" id="ff-valor" inputmode="decimal" placeholder="0,00" value="${l ? l.valor.toFixed(2).replace('.', ',') : ''}" required></div>
        <div class="field"><label for="ff-data">Data *</label><input class="input" id="ff-data" type="date" required value="${l?.data || hojeISO()}"></div>
        <div class="field full"><label for="ff-desc">Descrição *</label><input class="input" id="ff-desc" maxlength="200" required value="${esc(l?.descricao || '')}" placeholder="Ex.: Lanche da sexta"></div>
        <div class="field full"><label for="ff-cat">Categoria</label><select class="input" id="ff-cat"><option value="">Sem categoria</option>${[...categorias, ...(l?.categoria && !categorias.includes(l.categoria) ? [l.categoria] : [])].map((c) => `<option ${l?.categoria === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          ${categorias.length ? '' : '<span class="hint">Nenhuma categoria ainda. Crie em "Categorias", ao lado de "Baixar planilha".</span>'}</div>
      </div>
      <div class="janela-acoes rodape-acoes">
        ${!novo && podeApagar ? `<button type="button" class="link-btn danger com-icone" id="ff-apagar">${icon('lixeira')}Apagar</button>` : '<span></span>'}
        <div class="dir-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">${novo ? 'Lançar' : 'Salvar'}</button></div></div></form>`,
    aoAbrir: (j, fechar) => {
      const dicas = { despesa: 'Um gasto: sai do saldo.', entrada: 'Oferta, doação ou outra entrada: soma no saldo.', verba: 'O valor separado para o ano (pode lançar mais de uma vez, se vier em partes).' };
      const marcarTipo = () => {
        j.querySelectorAll('#ff-tipo [data-t]').forEach((b) => b.classList.toggle('ativo', b.dataset.t === tipo));
        j.querySelector('#ff-dica').textContent = dicas[tipo];
      };
      marcarTipo();
      j.querySelector('#ff-tipo').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tipo = b.dataset.t; j.alterou = true; marcarTipo(); });
      // Valor: aceita "150", "150,50" ou "1.250,00"; ao sair do campo fica no formato certinho
      const v = j.querySelector('#ff-valor');
      v.addEventListener('blur', () => { const n = lerValor(v.value); if (Number.isFinite(n) && n > 0) v.value = n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); });
      (novo ? v : j.querySelector('#ff-desc')).focus();
      j.querySelector('#ff').addEventListener('submit', async (e) => {
        e.preventDefault();
        const valor = lerValor(v.value);
        if (!Number.isFinite(valor) || valor <= 0) return aviso('Informe um valor maior que zero.', 'erro');
        const corpo = { tipo, valor: String(valor), data: j.querySelector('#ff-data').value, descricao: j.querySelector('#ff-desc').value, categoria: j.querySelector('#ff-cat').value };
        await ocupado(e.submitter, async () => {
          try {
            await api(novo ? 'POST' : 'PUT', novo ? '/financeiro' : `/financeiro/${l.id}`, corpo);
            aviso(novo ? `${TIPOS[tipo].rotulo} lançada: ${real(valor)}.` : 'Lançamento corrigido.');
            fechar(); depois();
          } catch (err) { avisoErro(err); }
        });
      });
      j.querySelector('#ff-apagar')?.addEventListener('click', async () => {
        if (!(await confirmar(`Apagar "${l.descricao}" (${real(l.valor)})? Fica registrado nas atividades.`, { botao: 'Apagar', perigo: true }))) return;
        try { await api('DELETE', `/financeiro/${l.id}`); aviso('Lançamento apagado.'); fechar(); depois(); } catch (err) { avisoErro(err); }
      });
    },
  });
}

// Categorias do financeiro: igual às funções da escala. Só grava quando clica em Salvar.
function editarCategorias(cadastradas, depois) {
  let linhas = cadastradas.map((c) => ({ id: c.id, nome: c.nome }));
  janela({
    titulo: 'Categorias do financeiro',
    corpo: `<form id="fc-form" style="display:grid;gap:12px">
      <p class="hint">Aparecem para escolher no lançamento (ex.: Lanche, Decoração, Evento). Renomear corrige os lançamentos antigos; tirar da lista não apaga nenhum lançamento.</p>
      <div id="fc-lista" class="fn-lista"></div>
      <button type="button" class="btn sm fn-add" id="fc-add">${icon('plus')} Adicionar categoria</button>
      <div class="janela-acoes rodape-acoes"><span class="muted small" id="fc-total"></span>
        <div class="dir-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div></div></form>`,
    aoAbrir: (j, fechar) => {
      const box = j.querySelector('#fc-lista');
      const ler = () => { linhas = [...box.querySelectorAll('.fc-linha')].map((l) => ({ id: l.dataset.id ? Number(l.dataset.id) : null, nome: l.querySelector('input').value })); };
      const pintar = (focar) => {
        box.innerHTML = linhas.map((c) => `<div class="fc-linha" ${c.id ? `data-id="${c.id}"` : ''}>
          <input class="input" value="${esc(c.nome)}" maxlength="60" placeholder="Ex.: Lanche" aria-label="Nome da categoria">
          <button type="button" class="btn-icone fc-tirar" title="Tirar esta categoria" aria-label="Tirar esta categoria">${icon('lixeira')}</button></div>`).join('')
          || '<p class="muted small fn-vazio">Nenhuma categoria.</p>';
        j.querySelector('#fc-total').textContent = linhas.length ? `${linhas.length} categoria${linhas.length === 1 ? '' : 's'}` : '';
        if (focar) box.querySelector('.fc-linha:last-child input')?.focus();
      };
      pintar();
      j.querySelector('#fc-add').addEventListener('click', () => { ler(); linhas.push({ id: null, nome: '' }); j.alterou = true; pintar(true); });
      box.addEventListener('click', (e) => {
        const b = e.target.closest('.fc-tirar'); if (!b) return;
        ler(); linhas.splice([...box.querySelectorAll('.fc-linha')].indexOf(b.closest('.fc-linha')), 1); j.alterou = true; pintar();
      });
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.fc-linha input')) { e.preventDefault(); j.querySelector('#fc-add').click(); } });
      if (!linhas.length) j.querySelector('#fc-add').click();
      j.querySelector('#fc-form').addEventListener('submit', async (e) => {
        e.preventDefault(); ler();
        const categorias = linhas.filter((c) => c.nome.trim());
        await ocupado(e.submitter, async () => {
          try { await api('PUT', '/financeiro/categorias', { categorias }); aviso('Categorias salvas.'); fechar(); depois(); } catch (err) { avisoErro(err); }
        });
      });
    },
  });
}
