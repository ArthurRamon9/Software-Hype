// Ministérios
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, isAdmin } from '../api.js';
import { esc, aviso, avisoErro, ocupado, janela, confirmar } from '../ui.js';
import { navegar } from '../app.js';

export async function render(conteudo) {
  const lista = await api('GET', '/ministerios');
  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Ministérios</h1></div><div class="acoes"><button class="btn primary" id="novo">Novo ministério</button></div></div>
    <div class="painel"><div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Nome</th><th class="some-mobile">Descrição</th><th class="dir">Pessoas</th><th></th></tr></thead>
      <tbody>${lista.map((m) => `<tr class="${m.cd_status ? '' : 'inativo'}">
        <td><span class="ponto" style="background:${esc(m.cor)};margin-right:8px"></span>${esc(m.nome)}${m.cd_status ? '' : ' <span class="tag">inativo</span>'}</td>
        <td class="some-mobile muted">${esc(m.descricao || '')}</td>
        <td class="dir num"><button class="link-btn" data-ver="${m.id}">${m.pessoas}</button></td>
        <td class="dir"><button class="link-btn" data-editar="${m.id}">Editar</button></td></tr>`).join('') || '<tr><td colspan="4" class="vazio">Nenhum ministério.</td></tr>'}</tbody>
    </table></div></div>`;

  const editar = (m = { nome: '', descricao: '', cor: '#1d5c4f', cd_status: 1 }) => janela({
    titulo: m.id ? 'Editar ministério' : 'Novo ministério',
    corpo: `<form id="fm" style="display:grid;gap:12px">
      <div class="field"><label for="mn">Nome *</label><input class="input" id="mn" value="${esc(m.nome)}" required></div>
      <div class="field"><label for="md">Descrição</label><input class="input" id="md" value="${esc(m.descricao || '')}"></div>
      <div class="field"><label for="mc">Cor</label><input type="color" id="mc" value="${esc(m.cor)}" style="width:48px;height:32px;padding:0;border:1px solid var(--line-2);border-radius:4px"></div>
      ${m.id ? `<label class="check"><input type="checkbox" id="ma" ${m.cd_status ? 'checked' : ''}>Ativo</label>` : ''}
      <div class="janela-acoes" style="justify-content:space-between">
        ${m.id && isAdmin() ? '<button type="button" class="link-btn danger" id="del">Excluir</button>' : '<span></span>'}
        <div style="display:flex;gap:8px"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div></div></form>`,
    aoAbrir: (j, fechar) => {
      j.querySelector('#mn').focus();
      j.querySelector('#fm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const corpo = { nome: j.querySelector('#mn').value, descricao: j.querySelector('#md').value, cor: j.querySelector('#mc').value, cd_status: m.id ? (j.querySelector('#ma').checked ? 1 : 0) : 1 };
        await ocupado(e.submitter, async () => {
          try { await api(m.id ? 'PUT' : 'POST', m.id ? `/ministerios/${m.id}` : '/ministerios', corpo); aviso('Salvo.'); fechar(); render(conteudo); } catch (err) { avisoErro(err); }
        });
      });
      j.querySelector('#del')?.addEventListener('click', async () => {
        fechar();
        if (!(await confirmar(`Excluir o ministério ${m.nome}? As pessoas continuam cadastradas, só perdem o vínculo.`, { botao: 'Excluir', perigo: true }))) return;
        try { await api('DELETE', `/ministerios/${m.id}`); aviso('Excluído.'); render(conteudo); } catch (err) { avisoErro(err); }
      });
    },
  });

  conteudo.querySelector('#novo').onclick = () => editar();
  conteudo.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editar(lista.find((m) => m.id === Number(b.dataset.editar)))));
  conteudo.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => { sessionStorage.setItem('hype_filtro_min', b.dataset.ver); navegar('/pessoas'); }));
}
