// Ministérios
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, pode } from '../api.js';
import { esc, aviso, avisoErro, ocupado, janela, confirmar, icon, filtrarPorNome } from '../ui.js';
import { navegar } from '../app.js';

// Paleta de cores para os ministérios (combina com o resto do sistema)
const CORES = ['#f0561d', '#e0a020', '#1f8a57', '#2a9d8f', '#2a78d6', '#5b4bd6', '#c2417a', '#b03a2e', '#6b5b45', '#4b4852'];

export async function render(conteudo) {
  const lista = await api('GET', '/ministerios');
  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Ministérios</h1><p class="sub">Onde cada jovem serve. Isto é só informação: o que cada um pode fazer no sistema fica em Acessos → Grupos.</p></div><div class="acoes">${pode('ministerios.editar') ? '<button class="btn primary" id="novo">Novo ministério</button>' : ''}</div></div>
    <div class="painel"><div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Nome</th><th class="some-mobile">Descrição</th><th class="dir">Pessoas</th><th></th></tr></thead>
      <tbody>${lista.map((m) => `<tr class="${m.cd_status ? '' : 'inativo'}">
        <td><span class="ponto" style="background:${esc(m.cor)};margin-right:8px"></span>${esc(m.nome)}${m.cd_status ? '' : ' <span class="tag">inativo</span>'}</td>
        <td class="some-mobile muted">${esc(m.descricao || '')}</td>
        <td class="dir num">${m.pessoas ? `<button class="link-btn" data-ver="${m.id}" title="Ver essas pessoas">${m.pessoas}</button>` : '<span class="muted">0</span>'}</td>
        <td class="dir">${pode('ministerios.editar') ? `<button class="link-btn" data-editar="${m.id}">Editar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="vazio">Nenhum ministério.</td></tr>'}</tbody>
    </table></div></div>`;

  const editar = async (m = { nome: '', descricao: '', cor: CORES[0], cd_status: 1 }) => {
    // Pessoas ativas, marcando quem já participa (no novo ministério ninguém participa ainda)
    const todas = await api('GET', `/ministerios/${m.id || 0}/pessoas`);
    const escolhidas = new Set(todas.filter((p) => p.membro).map((p) => p.id));
    const original = [...escolhidas].sort().join(',');
    const porId = new Map(todas.map((p) => [p.id, p]));
    janela({
      titulo: m.id ? 'Editar ministério' : 'Novo ministério',
      corpo: `<form id="fm" style="display:grid;gap:14px">
        <div class="field"><label for="mn">Nome *</label><input class="input" id="mn" value="${esc(m.nome)}" required></div>
        <div class="field"><label for="md">Descrição</label><input class="input" id="md" value="${esc(m.descricao || '')}"></div>
        <div class="field"><span class="label">Cor</span>
          <div class="cores">${CORES.map((c) => `<label style="--c:${c}" title="${c}"><input type="radio" name="cor" value="${c}" ${(m.cor || CORES[0]).toLowerCase() === c ? 'checked' : ''}></label>`).join('')}</div></div>
        <div class="field"><label for="mb">Pessoas no ministério <span class="muted small" id="mqtd"></span></label>
          <div class="escolhidas" id="mesc"></div>
          <input class="input" id="mb" type="search" placeholder="Digite um nome para acrescentar" autocomplete="off" style="margin-top:8px">
          <div class="sugestoes" id="msug"></div></div>
        ${m.id ? `<label class="check"><input type="checkbox" id="ma" ${m.cd_status ? 'checked' : ''}>Ativo</label>` : ''}
        <div class="janela-acoes" style="justify-content:space-between">
          ${m.id ? '<button type="button" class="link-btn danger" id="del">Excluir</button>' : '<span></span>'}
          <div style="display:flex;gap:8px"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div></div></form>`,
      aoAbrir: (j, fechar) => {
        const busca = j.querySelector('#mb');
        const pintar = () => {
          const lista = [...escolhidas].map((id) => porId.get(id)).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome));
          j.querySelector('#mqtd').textContent = lista.length ? `(${lista.length})` : '';
          j.querySelector('#mesc').innerHTML = lista.map((p) => `<button type="button" data-tirar="${p.id}" title="Tirar do ministério">${esc(p.nome)}${p.referencia ? ` <span class="muted">· ${esc(p.referencia)}</span>` : ''}${icon('xis')}</button>`).join('')
            || '<span class="hint">Ninguém ainda.</span>';
          const termo = busca.value.trim();
          j.querySelector('#msug').innerHTML = termo ? filtrarPorNome(todas.filter((p) => !escolhidas.has(p.id)), termo).slice(0, 6)
            .map((p) => `<button type="button" data-por="${p.id}">${esc(p.nome)}${p.referencia ? `<span>${esc(p.referencia)}</span>` : ''}</button>`).join('') : '';
        };
        pintar();
        busca.addEventListener('input', pintar);
        busca.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); j.querySelector('#msug button')?.click(); } });
        j.querySelector('#msug').addEventListener('click', (ev) => { const b = ev.target.closest('[data-por]'); if (!b) return; escolhidas.add(Number(b.dataset.por)); busca.value = ''; pintar(); busca.focus(); });
        j.querySelector('#mesc').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tirar]'); if (!b) return; escolhidas.delete(Number(b.dataset.tirar)); pintar(); });
        if (!m.id) j.querySelector('#mn').focus();
        j.querySelector('#fm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const corpo = { nome: j.querySelector('#mn').value, descricao: j.querySelector('#md').value, cor: j.querySelector('input[name=cor]:checked')?.value || CORES[0], cd_status: m.id ? (j.querySelector('#ma').checked ? 1 : 0) : 1 };
          await ocupado(e.submitter, async () => {
            try {
              const r = await api(m.id ? 'PUT' : 'POST', m.id ? `/ministerios/${m.id}` : '/ministerios', corpo);
              const id = m.id || r.id;
              if ([...escolhidas].sort().join(',') !== original) await api('PUT', `/ministerios/${id}/pessoas`, { pessoas: [...escolhidas] });
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
  conteudo.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editar(lista.find((m) => m.id === Number(b.dataset.editar))).catch(avisoErro)));
  conteudo.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => { sessionStorage.setItem('hype_filtro_min', b.dataset.ver); navegar('/pessoas'); }));
}
