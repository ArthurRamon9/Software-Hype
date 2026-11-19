// Ministérios
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, pode, preaquecer } from '../api.js';
import { esc, aviso, avisoErro, ocupado, janela, confirmar, icon, filtrarPorNome } from '../ui.js';
import { navegar } from '../app.js';

// Paleta de cores para os ministérios (combina com o resto do sistema e funciona nos dois temas)
const CORES = ['#f0561d', '#e0a020', '#c9b70c', '#7cb518', '#1f8a57', '#2a9d8f', '#19b8d4', '#2a78d6', '#3d4fc4', '#5b4bd6',
  '#7b2ff7', '#a13ad1', '#c2417a', '#e8336d', '#b03a2e', '#8a5a2b', '#6b5b45', '#4b4852'];

// Ordem da tabela: clicar no título da coluna ordena (clicar de novo inverte)
const ordem = { col: 'nome', dir: 1 };

export async function render(conteudo) {
  const bruto = await api('GET', '/ministerios');
  const lista = [...bruto].sort((a, b) => (ordem.col === 'pessoas' ? (a.pessoas - b.pessoas) || a.nome.localeCompare(b.nome) : a.nome.localeCompare(b.nome)) * ordem.dir);
  const seta = (c) => (ordem.col === c ? `<span class="seta-ordem">${ordem.dir > 0 ? '↑' : '↓'}</span>` : '');
  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Ministérios</h1><p class="sub">${pode('ministerios.editar') ? 'Onde cada jovem serve. Isto é só informação: o que cada um pode fazer no sistema fica em Acessos → Grupos.' : 'Onde cada jovem serve e quem lidera cada ministério.'}</p></div><div class="acoes">${pode('ministerios.editar') ? '<button class="btn primary" id="novo">Novo ministério</button>' : ''}</div></div>
    <div class="painel"><div class="tabela-wrap"><table class="tabela">
      <thead><tr><th><button class="th-ordem" data-ordem="nome">Nome${seta('nome')}</button></th><th class="some-mobile">Descrição</th><th class="dir"><button class="th-ordem" data-ordem="pessoas">Pessoas${seta('pessoas')}</button></th><th></th></tr></thead>
      <tbody>${lista.map((m) => `<tr class="${m.cd_status ? '' : 'inativo'} ${pode('ministerios.editar') ? 'clicavel' : ''}" data-linha="${m.id}">
        <td><span class="ponto" style="background:${esc(m.cor)};margin-right:8px"></span>${esc(m.nome)}${m.cd_status ? '' : ' <span class="tag">inativo</span>'}</td>
        <td class="some-mobile muted">${m.lideres ? `Líder: ${esc(m.lideres)}` : esc(m.descricao || '')}</td>
        <td class="dir num">${m.pessoas ? `<button class="link-btn" data-ver="${m.id}" title="Ver essas pessoas">${m.pessoas}</button>` : '<span class="muted">0</span>'}</td>
        <td class="dir">${pode('ministerios.editar') ? `<button class="link-btn" data-editar="${m.id}">Editar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="vazio">Nenhum ministério.</td></tr>'}</tbody>
    </table></div></div>`;

  const editar = async (m = { nome: '', descricao: '', cor: CORES[0], cd_status: 1 }) => {
    // A janela abre na hora; as pessoas (quem já participa) chegam logo depois
    let todas = [];
    const escolhidas = new Set();
    const lideres = new Set();
    const assinatura = () => `${[...escolhidas].sort().join(',')}|${[...lideres].filter((x) => escolhidas.has(x)).sort().join(',')}`;
    let original = assinatura();
    let porId = new Map();
    let carregou = false;
    janela({
      titulo: m.id ? 'Editar ministério' : 'Novo ministério',
      corpo: `<form id="fm" style="display:grid;gap:14px">
        <div class="field"><label for="mn">Nome *</label><input class="input" id="mn" value="${esc(m.nome)}" required></div>
        <div class="field"><label for="md">Descrição</label><input class="input" id="md" value="${esc(m.descricao || '')}"></div>
        <div class="field"><span class="label">Cor</span>
          <div class="cores">${CORES.map((c) => `<label style="--c:${c}" title="${c}"><input type="radio" name="cor" value="${c}" ${(m.cor || CORES[0]).toLowerCase() === c ? 'checked' : ''}></label>`).join('')}</div></div>
        <div class="field"><label for="mb">Pessoas no ministério <span class="muted small" id="mqtd"></span></label>
          <span class="hint" style="margin:-2px 0 6px">Marque "Líder" em quem lidera: o líder monta as escalas e cria as reuniões do ministério.</span>
          <div class="escolhidas" id="mesc"><span class="hint">Carregando as pessoas…</span></div>
          <input class="input" id="mb" type="search" placeholder="Digite um nome para acrescentar" autocomplete="off" style="margin-top:8px">
          <div class="sugestoes" id="msug"></div></div>
        ${m.id ? `<label class="check"><input type="checkbox" id="ma" ${m.cd_status ? 'checked' : ''}>Ativo</label>` : ''}
        <div class="janela-acoes" style="justify-content:space-between">
          ${m.id && pode('acessos.gerenciar') ? '<button type="button" class="link-btn danger" id="del">Excluir</button>' : '<span></span>'}
          <div style="display:flex;gap:8px"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div></div></form>`,
      aoAbrir: (j, fechar) => {
        const busca = j.querySelector('#mb');
        const pintar = () => {
          if (!carregou) return;
          const lista = [...escolhidas].map((id) => porId.get(id)).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome));
          j.querySelector('#mqtd').textContent = lista.length ? `(${lista.length})` : '';
          j.querySelector('#mesc').innerHTML = lista.map((p) => `<span class="chip-pessoa ${lideres.has(p.id) ? 'lider' : ''}">${esc(p.nome)}${p.referencia ? ` <span class="muted">· ${esc(p.referencia)}</span>` : ''}
              <button type="button" class="marca-lider" data-lider="${p.id}" title="${lideres.has(p.id) ? 'É líder. Clique para tirar' : 'Marcar como líder'}">Líder</button>
              <button type="button" data-tirar="${p.id}" title="Tirar do ministério" aria-label="Tirar ${esc(p.nome)}">${icon('xis')}</button></span>`).join('')
            || '<span class="hint">Ninguém ainda.</span>';
          const termo = busca.value.trim();
          j.querySelector('#msug').innerHTML = termo ? filtrarPorNome(todas.filter((p) => !escolhidas.has(p.id)), termo).slice(0, 6)
            .map((p) => `<button type="button" data-por="${p.id}">${esc(p.nome)}${p.referencia ? `<span>${esc(p.referencia)}</span>` : ''}</button>`).join('') : '';
        };
        api('GET', `/ministerios/${m.id || 0}/pessoas`).then((t) => {
          todas = t; porId = new Map(todas.map((p) => [p.id, p]));
          todas.filter((p) => p.membro).forEach((p) => { escolhidas.add(p.id); if (p.lider) lideres.add(p.id); });
          original = assinatura(); carregou = true; pintar();
        }).catch((err) => { j.querySelector('#mesc').innerHTML = `<span class="hint">${esc(err.message)}</span>`; });
        busca.addEventListener('input', pintar);
        busca.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); j.querySelector('#msug button')?.click(); } });
        j.querySelector('#msug').addEventListener('click', (ev) => { const b = ev.target.closest('[data-por]'); if (!b) return; escolhidas.add(Number(b.dataset.por)); j.alterou = true; busca.value = ''; pintar(); busca.focus(); });
        j.querySelector('#mesc').addEventListener('click', (ev) => {
          const l = ev.target.closest('[data-lider]');
          if (l) { const id = Number(l.dataset.lider); if (lideres.has(id)) lideres.delete(id); else lideres.add(id); j.alterou = true; pintar(); return; }
          const b = ev.target.closest('[data-tirar]'); if (!b) return; escolhidas.delete(Number(b.dataset.tirar)); lideres.delete(Number(b.dataset.tirar)); j.alterou = true; pintar();
        });
        if (!m.id) j.querySelector('#mn').focus();
        j.querySelector('#fm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const corpo = { nome: j.querySelector('#mn').value, descricao: j.querySelector('#md').value, cor: j.querySelector('input[name=cor]:checked')?.value || CORES[0], cd_status: m.id ? (j.querySelector('#ma').checked ? 1 : 0) : 1 };
          await ocupado(e.submitter, async () => {
            try {
              const r = await api(m.id ? 'PUT' : 'POST', m.id ? `/ministerios/${m.id}` : '/ministerios', corpo);
              const id = m.id || r.id;
              if (carregou && assinatura() !== original) await api('PUT', `/ministerios/${id}/pessoas`, { pessoas: [...escolhidas], lideres: [...lideres].filter((x) => escolhidas.has(x)) });
              aviso('Ministério salvo.'); fechar(); render(conteudo);
            } catch (err) { avisoErro(err); }
          });
        });
        j.querySelector('#del')?.addEventListener('click', async () => {
          fechar();
          if (!(await confirmar(`Excluir o ministério ${m.nome}? As pessoas continuam cadastradas, só perdem o vínculo.`, { botao: 'Excluir', perigo: true }))) return;
          try { await api('DELETE', `/ministerios/${m.id}`); aviso('Excluído.'); render(conteudo); } catch (err) { avisoErro(err); }
        });
      },
    });
  };

  conteudo.querySelector('#novo')?.addEventListener('click', () => editar().catch(avisoErro));
  conteudo.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); editar(lista.find((m) => m.id === Number(b.dataset.editar))).catch(avisoErro); }));
  // Clicar na linha também abre; passar o mouse já começa a buscar as pessoas do ministério
  if (pode('ministerios.editar')) conteudo.querySelectorAll('tr[data-linha]').forEach((tr) => {
    tr.addEventListener('pointerenter', () => preaquecer(`/ministerios/${tr.dataset.linha}/pessoas`), { once: true });
    tr.addEventListener('click', (e) => { if (e.target.closest('[data-ver], [data-editar]')) return; editar(lista.find((m) => m.id === Number(tr.dataset.linha))).catch(avisoErro); });
  });
  conteudo.querySelectorAll('[data-ordem]').forEach((b) => b.addEventListener('click', () => {
    if (ordem.col === b.dataset.ordem) ordem.dir *= -1; else { ordem.col = b.dataset.ordem; ordem.dir = b.dataset.ordem === 'pessoas' ? -1 : 1; }
    render(conteudo).catch(avisoErro);
  }));
  conteudo.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => { sessionStorage.setItem('hype_filtro_min', b.dataset.ver); navegar('/pessoas'); }));
}
