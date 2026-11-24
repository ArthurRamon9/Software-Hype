// Financeiro do Hype: verba do ano, despesas e entradas (ofertas, doações...), com o saldo sempre à vista
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, pode } from '../api.js';
import { esc, $, icon, aviso, avisoErro, ocupado, janela, confirmar, fmtData, hojeISO, semAcento, autocompletar } from '../ui.js';
import { baixarXLSX } from '../xlsx.js';

let ano = null;
let aba = 'lancamentos';   // lancamentos | estoque
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
const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'pct', 'cx', 'fardo', 'dz'];
const qtdTxt = (n, un) => `${(Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${un ? ` ${un}` : ''}`;
const urlNota = (l) => `api/financeiro/${l.id}/nota?v=${encodeURIComponent(l.nota_v || '')}`;

// Nota fiscal: foto reduzida no aparelho (até 1600 px, JPEG) para caber em 1 MB; PDF vai como está
async function prepararNota(arquivo) {
  const lerDataUrl = (blob) => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = erro; r.readAsDataURL(blob); });
  if (arquivo.type === 'application/pdf') {
    if (arquivo.size > 1024 * 1024) throw new Error('O PDF passa de 1 MB. Tire uma foto da nota em vez disso.');
    return { arquivo: await lerDataUrl(arquivo), nome: arquivo.name };
  }
  if (!arquivo.type.startsWith('image/')) throw new Error('Envie uma foto ou um PDF da nota.');
  const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Não deu para abrir esta imagem.')); i.src = URL.createObjectURL(arquivo); });
  for (const [max, q] of [[1600, 0.78], [1280, 0.68], [1000, 0.6]]) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', q));
    if (blob && blob.size < 950 * 1024) { URL.revokeObjectURL(img.src); return { arquivo: await lerDataUrl(blob), nome: 'nota.jpg' }; }
  }
  URL.revokeObjectURL(img.src);
  throw new Error('A foto ficou grande demais. Tente de novo mais perto da nota.');
}
export function verNota(l) {
  if (l.nota_tipo === 'application/pdf') { const a = document.createElement('a'); a.href = urlNota(l); a.download = ''; document.body.append(a); a.click(); a.remove(); return; }
  janela({ titulo: `Nota · ${l.descricao}`, larga: true, avisarAoSair: false,
    corpo: `<div class="nota-ver"><img src="${urlNota(l)}" alt="Nota fiscal de ${esc(l.descricao)}"></div>
      <div class="janela-acoes"><a class="btn" href="${urlNota(l)}" download="nota-${l.id}.jpg">Baixar</a><button type="button" class="btn primary" data-fechar>Fechar</button></div>` });
}

export async function render(conteudo) {
  ano = ano || new Date().getFullYear();
  const { lancamentos, anos, itens = [], categorias: cadastradas = [] } = await api('GET', `/financeiro?ano=${ano}`);
  const podeEditar = pode('financeiro.editar'), podeApagar = pode('financeiro.excluir') || pode('acessos.gerenciar');
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
  const ativos = itens.filter((i) => i.cd_status);
  const faltando = ativos.filter((i) => i.minimo !== null && i.saldo <= i.minimo);

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Financeiro</h1><p class="sub">A verba do ano, o que entrou e o que foi gasto. O saldo se atualiza a cada lançamento.</p></div>
      <div class="acoes">
        <select class="input" id="fin-ano" style="width:auto" aria-label="Ano">${anosLista.map((a) => `<option value="${a}" ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
        ${podeEditar ? '<button class="btn" id="fin-cats">Categorias</button>' : ''}
        <button class="btn" id="fin-planilha">Baixar planilha</button>
        ${podeEditar ? `<button class="btn primary" id="fin-novo">${icon('plus')} Novo lançamento</button>` : ''}
      </div></div>
    <div class="abas" id="fin-aba" style="margin-bottom:16px"><button data-a="lancamentos" class="${aba === 'lancamentos' ? 'ativo' : ''}">Dinheiro</button><button data-a="estoque" class="${aba === 'estoque' ? 'ativo' : ''}">${icon('caixa')} Estoque${faltando.length ? ` <span class="sug-n">${faltando.length}</span>` : ''}</button></div>
    <div id="fin-estoque" ${aba === 'estoque' ? '' : 'hidden'}></div>
    <div id="fin-dinheiro" ${aba === 'lancamentos' ? '' : 'hidden'}>
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
      <section class="painel" style="align-self:start">
        <div class="painel-topo"><h2>Para onde foi o dinheiro</h2><span class="sub">Gastos por categoria</span></div>
        <div class="painel-corpo">${porCat.length ? `<div class="fin-cats">${porCat.map(([c, v]) => `<div><span>${esc(c)}</span><b>${real(v)}</b><i style="width:${Math.max(4, Math.round((v / maiorCat) * 100))}%"></i></div>`).join('')}</div>`
          : '<div class="vazio" style="padding:18px 0"><b>Nenhum gasto ainda</b>Quando lançar uma despesa com categoria (ex.: Lanche), ela aparece aqui.</div>'}</div>
      </section>
    </div></div>`;
  conteudo.querySelectorAll('#fin-aba [data-a]').forEach((b) => b.addEventListener('click', () => {
    aba = b.dataset.a;
    conteudo.querySelectorAll('#fin-aba [data-a]').forEach((x) => x.classList.toggle('ativo', x === b));
    $('#fin-estoque').hidden = aba !== 'estoque'; $('#fin-dinheiro').hidden = aba !== 'lancamentos';
  }));
  desenharEstoque($('#fin-estoque'), { itens, podeEditar, recarregar });

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
        <td><div class="fin-desc"><b>${esc(x.descricao)}</b><span class="fin-tipo t-${x.tipo}">${TIPOS[x.tipo].rotulo}</span>${x.quantidade ? `<span class="fin-qtd">${qtdTxt(x.quantidade, x.unidade)}${x.item ? ' · no estoque' : ''}</span>` : ''}${x.nota_tipo ? `<button type="button" class="fin-nota" data-nota="${x.id}" title="Ver a nota fiscal" aria-label="Ver a nota fiscal">${icon('clipe')}Nota</button>` : ''}</div></td>
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
  $('#fin-novo')?.addEventListener('click', () => editar(null, nomesCad, recarregar, podeApagar, ativos));
  $('#fin-cats')?.addEventListener('click', () => editarCategorias(cadastradas, recarregar));
  $('#fin-linhas').addEventListener('click', (e) => {
    const n = e.target.closest('[data-nota]');
    if (n) return verNota(lancamentos.find((x) => x.id === Number(n.dataset.nota)));
    const tr = e.target.closest('tr[data-id]'); if (!tr || !podeEditar) return;
    editar(lancamentos.find((x) => x.id === Number(tr.dataset.id)), nomesCad, recarregar, podeApagar, ativos);
  });
  $('#fin-planilha').addEventListener('click', () => baixarXLSX(`financeiro-hype-${ano}`, [
    { nome: 'Resumo', semFiltro: true, linhas: [[`Financeiro ${ano}`, 'Valor'], ['Verba', verba], ['Entradas', entradas], ['Gastos', gastos], ['Saldo', saldo]] },
    { nome: 'Lançamentos', linhas: [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Quantidade', 'Unidade', 'Nota fiscal', 'Lançado por'],
      ...[...lancamentos].sort((x, y) => x.data.localeCompare(y.data)).map((x) => [x.data, TIPOS[x.tipo].rotulo, x.descricao, x.categoria || '', TIPOS[x.tipo].sinal * x.valor, x.quantidade ?? '', x.unidade || '', x.nota_tipo ? 'Sim' : '', x.criado_por_nome || ''])] },
    ...(itens.length ? [{ nome: 'Estoque', linhas: [['Item', 'Em estoque', 'Unidade', 'Mínimo', 'Preço da última compra (por unidade)'], ...itens.filter((i) => i.cd_status).map((i) => [i.nome, i.saldo, i.unidade || '', i.minimo ?? '', i.preco_unidade ?? ''])] }] : []),
    ...(porCat.length ? [{ nome: 'Gastos por categoria', linhas: [['Categoria', 'Gasto'], ...porCat.map(([c, v]) => [c, v])], grafico: { titulo: `Gastos por categoria em ${ano}`, tipo: 'barra', categoria: 0, series: [1], rotulos: true } }] : []),
  ]));
}

// ---------- Novo / corrigir lançamento ----------
function editar(l, categorias, depois, podeApagar, itens = []) {
  const novo = !l;
  let nota = null;          // { arquivo, nome } escolhida agora
  let tirarNota = false;
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
        <div class="field"><label for="ff-qtd">Quantidade <span class="muted small">(opcional)</span></label><input class="input" id="ff-qtd" inputmode="decimal" placeholder="Ex.: 5" value="${l?.quantidade ? String(l.quantidade).replace('.', ',') : ''}"></div>
        <div class="field"><label for="ff-un">Unidade</label><input class="input" id="ff-un" maxlength="12" placeholder="kg, un, pct..." value="${esc(l?.unidade || '')}"></div>
        <div class="field full" id="ff-estoque-box" hidden><label class="check"><input type="checkbox" id="ff-estoque" ${l?.item ? 'checked' : ''}>Entra no estoque</label>
          <div id="ff-item-box" ${l?.item ? '' : 'hidden'} style="margin-top:8px"><input class="input" id="ff-item" maxlength="80" placeholder="Qual item? Ex.: Arroz" value="${esc(l?.item || '')}">
          <span class="hint">Escolha um item da lista ou escreva um nome novo: ele é criado ao salvar.</span></div></div>
        <div class="field full"><span class="label">Nota fiscal <span class="muted small">(opcional: foto ou PDF)</span></span>
          <div class="fin-nota-campo" id="ff-nota-box"></div>
          <input type="file" id="ff-nota" accept="image/*,application/pdf" hidden></div>
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
      // Quantidade numa compra: pode entrar no estoque
      autocompletar(j.querySelector('#ff-un'), UNIDADES);
      autocompletar(j.querySelector('#ff-item'), itens.filter((i) => i.cd_status || i.nome === l?.item).map((i) => i.nome), { novo: (t) => `Item novo: "${t}" (criado ao salvar)` });
      const qtd = j.querySelector('#ff-qtd'), boxEst = j.querySelector('#ff-estoque-box'), chkEst = j.querySelector('#ff-estoque');
      const verEstoque = () => { boxEst.hidden = !(tipo === 'despesa' && qtd.value.trim()); j.querySelector('#ff-item-box').hidden = !chkEst.checked; };
      qtd.addEventListener('input', verEstoque); chkEst.addEventListener('change', verEstoque);
      j.querySelector('#ff-tipo').addEventListener('click', verEstoque);
      j.querySelector('#ff-item').addEventListener('change', (e) => { const it = itens.find((i) => i.nome.toLowerCase() === e.target.value.trim().toLowerCase()); const un = j.querySelector('#ff-un'); if (it?.unidade && !un.value) un.value = it.unidade; });
      verEstoque();
      // Nota fiscal: escolher (no celular abre a câmera ou a galeria), ver e tirar
      const boxNota = j.querySelector('#ff-nota-box'), inpNota = j.querySelector('#ff-nota');
      const pintarNota = () => {
        const tem = !tirarNota && (nota || l?.nota_tipo);
        boxNota.innerHTML = tem
          ? `<span class="fin-nota-ok">${icon('clipe')}${nota ? esc(nota.nome === 'nota.jpg' ? 'Foto da nota (nova)' : nota.nome) : l.nota_tipo === 'application/pdf' ? 'PDF da nota' : 'Foto da nota'}</span>
             <span class="fin-nota-acoes">${!nota && l?.nota_tipo ? '<button type="button" class="btn sm" id="ff-nota-ver">Ver</button>' : ''}<button type="button" class="btn sm" id="ff-nota-trocar">Trocar</button><button type="button" class="btn sm danger" id="ff-nota-tirar">${icon('lixeira')}Tirar</button></span>`
          : `<button type="button" class="btn sm" id="ff-nota-trocar">${icon('clipe')} Anexar nota</button>`;
      };
      pintarNota();
      boxNota.addEventListener('click', (e) => {
        if (e.target.closest('#ff-nota-trocar')) inpNota.click();
        if (e.target.closest('#ff-nota-ver')) verNota(l);
        if (e.target.closest('#ff-nota-tirar')) { nota = null; tirarNota = !!l?.nota_tipo; j.alterou = true; pintarNota(); }
      });
      inpNota.addEventListener('change', async () => {
        const f = inpNota.files[0]; inpNota.value = ''; if (!f) return;
        boxNota.innerHTML = '<span class="muted small">Preparando a nota…</span>';
        try { nota = await prepararNota(f); tirarNota = false; j.alterou = true; } catch (err) { avisoErro(err); }
        pintarNota();
      });
      j.querySelector('#ff').addEventListener('submit', async (e) => {
        e.preventDefault();
        const valor = lerValor(v.value);
        if (!Number.isFinite(valor) || valor <= 0) return aviso('Informe um valor maior que zero.', 'erro');
        const q = qtd.value.trim() ? lerValor(qtd.value) : null;
        if (q !== null && !(q > 0)) return aviso('A quantidade precisa ser maior que zero (ou deixe em branco).', 'erro');
        const noEstoque = tipo === 'despesa' && q !== null && chkEst.checked;
        const item = noEstoque ? j.querySelector('#ff-item').value.trim() : '';
        if (noEstoque && !item) return aviso('Diga qual item entra no estoque (ex.: Arroz).', 'erro');
        const corpo = { tipo, valor: String(valor), data: j.querySelector('#ff-data').value, descricao: j.querySelector('#ff-desc').value, categoria: j.querySelector('#ff-cat').value,
          quantidade: q === null ? '' : String(q), unidade: j.querySelector('#ff-un').value.trim(), item };
        await ocupado(e.submitter, async () => {
          let id = l?.id;
          try {
            const r = await api(novo ? 'POST' : 'PUT', novo ? '/financeiro' : `/financeiro/${l.id}`, corpo);
            if (novo) id = r.id;
          } catch (err) { return avisoErro(err); }
          try {
            if (nota) await api('PUT', `/financeiro/${id}/nota`, nota);
            else if (tirarNota) await api('DELETE', `/financeiro/${id}/nota`);
          } catch (err) { aviso(`Lançamento salvo, mas a nota não foi: ${err.message}`, 'erro'); fechar(true); return depois(); }
          aviso(novo ? `${TIPOS[tipo].rotulo} lançada: ${real(valor)}${nota ? ', com a nota' : ''}.` : 'Lançamento corrigido.');
          fechar(true); depois();
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

// ---------- Estoque: quanto tem de cada coisa, o que está acabando, usar e repor ----------
function desenharEstoque(box, { itens, podeEditar, recarregar }) {
  const ativos = itens.filter((i) => i.cd_status), parados = itens.filter((i) => !i.cd_status);
  const falta = (i) => i.minimo !== null && i.saldo <= i.minimo;
  const linha = (i) => `<tr class="clicavel ${falta(i) ? 'fin-falta' : ''}" data-item="${i.id}">
      <td><b>${esc(i.nome)}</b>${falta(i) ? '<span class="tag bad" style="margin-left:8px">Comprar</span>' : ''}</td>
      <td class="dir num"><b>${qtdTxt(i.saldo, i.unidade)}</b></td>
      <td class="dir some-mobile muted small">${i.minimo !== null ? qtdTxt(i.minimo, i.unidade) : '—'}</td>
      <td class="dir some-mobile muted small">${i.preco_unidade ? `${real(i.preco_unidade)}${i.unidade ? `/${esc(i.unidade)}` : ''}` : '—'}</td>
      <td class="dir acoes-linha">${podeEditar ? `<button class="btn sm" data-usar="${i.id}" title="Tirar do estoque (usou)">− Usar</button><button class="btn sm" data-repor="${i.id}" title="Entrou sem compra (doação, sobra...)">+ Entrou</button>` : ''}</td></tr>`;
  box.innerHTML = `
    ${ativos.some(falta) ? `<div class="aviso-conf centro">${icon('alerta')}<div><b>Acabando:</b> ${ativos.filter(falta).map((i) => `${esc(i.nome)} (${qtdTxt(i.saldo, i.unidade)})`).join(', ')}.</div></div>` : ''}
    <section class="painel">
      <div class="painel-topo"><h2>Estoque</h2>${podeEditar ? `<button class="btn sm primary" id="est-novo">${icon('plus')} Novo item</button>` : ''}</div>
      <p class="hint" style="padding:6px 18px 0">Compras lançadas com quantidade e "Entra no estoque" somam sozinhas. Quando usar, toque em "Usar". Toque no item para ver o histórico ou contar o que tem.</p>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Item</th><th class="dir">Tem</th><th class="dir some-mobile">Mínimo</th><th class="dir some-mobile">Última compra</th><th></th></tr></thead>
        <tbody>${ativos.length ? ativos.map(linha).join('') : `<tr><td colspan="5" class="vazio"><b>Nada no estoque ainda</b>${podeEditar ? 'Use "Novo item" (ex.: Arroz, 10 kg) ou lance uma compra com quantidade.' : ''}</td></tr>`}</tbody>
      </table></div>
      ${parados.length ? `<details class="fin-parados"><summary class="muted small">${parados.length} item${parados.length === 1 ? '' : 's'} guardado${parados.length === 1 ? '' : 's'} (fora da lista)</summary><table class="tabela"><tbody>${parados.map(linha).join('')}</tbody></table></details>` : ''}
    </section>`;
  box.querySelector('#est-novo')?.addEventListener('click', () => novoItem(recarregar));
  box.addEventListener('click', (e) => {
    const u = e.target.closest('[data-usar]'), r = e.target.closest('[data-repor]');
    if (u || r) { e.stopPropagation(); return mover(itens.find((i) => i.id === Number((u || r).dataset.usar || (u || r).dataset.repor)), u ? -1 : 1, recarregar); }
    const tr = e.target.closest('tr[data-item]');
    if (tr) historicoItem(itens.find((i) => i.id === Number(tr.dataset.item)), podeEditar, recarregar);
  });
}
function novoItem(depois) {
  janela({
    titulo: 'Novo item no estoque',
    corpo: `<form id="ni" class="form-r">
      <div class="field full"><label for="ni-nome">Item *</label><input class="input" id="ni-nome" maxlength="80" required placeholder="Ex.: Arroz"></div>
      <div class="field"><label for="ni-un">Unidade</label><input class="input" id="ni-un" maxlength="12" placeholder="kg, un, pct..."></div>
      <div class="field"><label for="ni-qtd">Quanto tem agora</label><input class="input" id="ni-qtd" inputmode="decimal" placeholder="0"></div>
      <div class="field full"><label for="ni-min">Avisar quando tiver menos que</label><input class="input" id="ni-min" inputmode="decimal" placeholder="Ex.: 2 (opcional)"></div>
      <div class="janela-acoes full"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div></form>`,
    aoAbrir: (j, fechar) => {
      autocompletar(j.querySelector('#ni-un'), UNIDADES);
      j.querySelector('#ni-nome').focus();
      j.querySelector('#ni').addEventListener('submit', (e) => { e.preventDefault(); ocupado(e.submitter, async () => {
        try {
          await api('POST', '/financeiro/estoque', { nome: j.querySelector('#ni-nome').value, unidade: j.querySelector('#ni-un').value, minimo: j.querySelector('#ni-min').value,
            quantidade: j.querySelector('#ni-qtd').value || '0', obs: 'Contagem inicial' });
          aviso('Item salvo.'); fechar(true); depois();
        } catch (err) { avisoErro(err); }
      }); });
    },
  });
}
// Usar (sai) ou entrou sem compra (doação, sobra)
function mover(item, sinal, depois) {
  janela({
    titulo: `${sinal < 0 ? 'Usar' : 'Entrou'}: ${item.nome}`,
    corpo: `<form id="mv" class="form-r">
      <div class="field"><label for="mv-qtd">Quantidade${item.unidade ? ` (${esc(item.unidade)})` : ''} *</label><input class="input" id="mv-qtd" inputmode="decimal" required placeholder="Ex.: 2"></div>
      <div class="field"><label for="mv-data">Data</label><input class="input" id="mv-data" type="date" value="${hojeISO()}"></div>
      <div class="field full"><label for="mv-obs">Observação</label><input class="input" id="mv-obs" maxlength="200" placeholder="${sinal < 0 ? 'Ex.: Janta da sexta' : 'Ex.: Doação da irmã Ana'}"></div>
      <p class="hint full">Tem agora: <b>${qtdTxt(item.saldo, item.unidade)}</b>.</p>
      <div class="janela-acoes full"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">${sinal < 0 ? 'Tirar do estoque' : 'Somar no estoque'}</button></div></form>`,
    aoAbrir: (j, fechar) => {
      j.querySelector('#mv-qtd').focus();
      j.querySelector('#mv').addEventListener('submit', (e) => { e.preventDefault(); ocupado(e.submitter, async () => {
        const q = lerValor(j.querySelector('#mv-qtd').value);
        if (!(q > 0)) return aviso('Informe a quantidade.', 'erro');
        if (sinal < 0 && q > item.saldo && !(await confirmar(`O estoque mostra só ${qtdTxt(item.saldo, item.unidade)}. Tirar ${qtdTxt(q, item.unidade)} mesmo assim? (Fica negativo até alguém contar de novo.)`, { botao: 'Tirar assim mesmo' }))) return;
        try {
          await api('POST', '/financeiro/estoque', { item_id: item.id, quantidade: String(sinal * q), data: j.querySelector('#mv-data').value, obs: j.querySelector('#mv-obs').value });
          aviso(sinal < 0 ? 'Saiu do estoque.' : 'Somado no estoque.'); fechar(true); depois();
        } catch (err) { avisoErro(err); }
      }); });
    },
  });
}
// Histórico do item, contagem (acerta o estoque com o que tem de verdade) e dados do item
async function historicoItem(item, podeEditar, depois) {
  const movs = await api('GET', `/financeiro/estoque/${item.id}`).catch((e) => { avisoErro(e); return null; });
  if (!movs) return;
  janela({
    titulo: item.nome,
    larga: true,
    corpo: `<div style="display:grid;gap:14px">
      <p style="margin:0">Tem agora: <b>${qtdTxt(item.saldo, item.unidade)}</b>${item.preco_unidade ? ` · última compra a ${real(item.preco_unidade)}${item.unidade ? `/${esc(item.unidade)}` : ''}` : ''}</p>
      ${podeEditar ? `<form id="ct" class="fin-contar"><label for="ct-qtd">Contei e tem</label><input class="input" id="ct-qtd" inputmode="decimal" placeholder="${qtdTxt(item.saldo)}"><span class="muted small">${esc(item.unidade || '')}</span><button class="btn sm">Acertar</button></form>` : ''}
      <div class="tabela-wrap" style="max-height:300px;overflow-y:auto"><table class="tabela"><tbody>${movs.length ? movs.map((m) => `<tr>
        <td class="small" style="white-space:nowrap">${fmtData(m.data)}</td><td class="small">${esc(m.obs || (m.quantidade > 0 ? 'Entrou' : 'Usou'))}${m.por ? `<span class="muted"> · ${esc(m.por.split(' ')[0])}</span>` : ''}</td>
        <td class="dir num ${m.quantidade < 0 ? 'txt-ruim' : ''}"><b>${m.quantidade > 0 ? '+' : '−'}${qtdTxt(Math.abs(m.quantidade), item.unidade)}</b></td>
        <td class="dir">${podeEditar && !m.lancamento_id ? `<button class="btn-icone" data-apagar-mov="${m.id}" title="Apagar este movimento" aria-label="Apagar este movimento">${icon('lixeira')}</button>` : ''}</td></tr>`).join('') : '<tr><td class="vazio">Nada ainda.</td></tr>'}</tbody></table></div>
      ${podeEditar ? `<details class="fin-item-dados"><summary class="link-btn small">Mudar nome, unidade ou mínimo</summary><form id="it" class="form-r" style="margin-top:10px">
        <div class="field full"><label for="it-nome">Item</label><input class="input" id="it-nome" maxlength="80" value="${esc(item.nome)}"></div>
        <div class="field"><label for="it-un">Unidade</label><input class="input" id="it-un" maxlength="12" value="${esc(item.unidade || '')}"></div>
        <div class="field"><label for="it-min">Avisar abaixo de</label><input class="input" id="it-min" inputmode="decimal" value="${item.minimo ?? ''}"></div>
        <label class="check full"><input type="checkbox" id="it-guardar" ${item.cd_status ? '' : 'checked'}>Guardar fora da lista (não compra mais)</label>
        <div class="janela-acoes full rodape-acoes">${pode('financeiro.excluir') || pode('acessos.gerenciar') ? `<button type="button" class="link-btn danger com-icone" id="it-excluir">${icon('lixeira')}Excluir item</button>` : '<span></span>'}<button class="btn primary">Salvar item</button></div></form></details>` : ''}
    </div>`,
    avisarAoSair: false,
    aoAbrir: (j, fechar) => {
      j.querySelector('#ct')?.addEventListener('submit', (e) => { e.preventDefault(); ocupado(e.submitter, async () => {
        const v = lerValor(j.querySelector('#ct-qtd').value);
        if (!Number.isFinite(v) || v < 0) return aviso('Informe quanto tem (pode ser 0).', 'erro');
        const dif = Math.round((v - item.saldo) * 100) / 100;
        if (!dif) return aviso('Já está certo.');
        try { await api('POST', '/financeiro/estoque', { item_id: item.id, quantidade: String(dif), obs: 'Contagem' }); aviso('Estoque acertado.'); fechar(); depois(); } catch (err) { avisoErro(err); }
      }); });
      if (j.querySelector('#it-un')) autocompletar(j.querySelector('#it-un'), UNIDADES);
      j.querySelector('#it-excluir')?.addEventListener('click', async () => {
        if (!(await confirmar(`Excluir "${item.nome}" do estoque? O histórico dele some junto. Os lançamentos de dinheiro continuam como estão.`, { botao: 'Excluir', perigo: true }))) return;
        try { await api('DELETE', `/financeiro/estoque/${item.id}`); aviso('Item excluído.'); fechar(); depois(); } catch (err) { avisoErro(err); }
      });
      j.querySelector('#it')?.addEventListener('submit', (e) => { e.preventDefault(); ocupado(e.submitter, async () => {
        try {
          await api('PUT', `/financeiro/estoque/${item.id}`, { nome: j.querySelector('#it-nome').value, unidade: j.querySelector('#it-un').value, minimo: j.querySelector('#it-min').value, cd_status: j.querySelector('#it-guardar').checked ? 0 : 1 });
          aviso('Item salvo.'); fechar(); depois();
        } catch (err) { avisoErro(err); }
      }); });
      j.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-apagar-mov]'); if (!b) return;
        if (!(await confirmar('Apagar este movimento do estoque?', { botao: 'Apagar', perigo: true }))) return;
        try { await api('DELETE', `/financeiro/estoque/mov/${b.dataset.apagarMov}`); aviso('Movimento apagado.'); fechar(); depois(); } catch (err) { avisoErro(err); }
      });
    },
  });
}
