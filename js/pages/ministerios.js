// Ministérios
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { sb, ok, isAdmin } from '../supabase.js';
import { icon, esc, toast, toastErro, carregando, modal, confirmar } from '../ui.js';

export async function render(content) {
  const [mins, vinc] = await Promise.all([
    ok(await sb.from('ministerios').select('*').order('nome')),
    ok(await sb.from('pessoa_ministerio').select('ministerio_id, pessoas!inner(cd_status)').eq('pessoas.cd_status', 1)),
  ]);
  const cont = {}; vinc.forEach((v) => { cont[v.ministerio_id] = (cont[v.ministerio_id] || 0) + 1; });

  content.innerHTML = `
    <div class="page-head"><div><h1>Ministérios</h1><p>Áreas em que os jovens servem.</p></div>
      <div class="actions"><button class="btn btn-primary" id="novo">${icon('plus')} Novo ministério</button></div></div>
    <div class="grid grid-3">
      ${mins.map((m) => `<div class="card" style="${m.cd_status ? '' : 'opacity:.55'}">
        <div class="card-head" style="margin-bottom:6px"><h2 style="display:flex;align-items:center;gap:10px"><span class="dot" style="background:${esc(m.cor)};width:12px;height:12px"></span>${esc(m.nome)}</h2>
          <button class="btn btn-ghost btn-icon btn-sm" data-edit="${m.id}" aria-label="Editar">${icon('edit')}</button></div>
        <p class="muted small" style="margin:0 0 12px">${esc(m.descricao || 'Sem descrição')}</p>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <a class="small" href="#/pessoas" data-filtro="${m.id}">${cont[m.id] || 0} ${cont[m.id] === 1 ? 'pessoa' : 'pessoas'} servindo</a>
          ${m.cd_status ? '' : '<span class="badge bad">Inativo</span>'}</div>
      </div>`).join('') || `<div class="card empty" style="grid-column:1/-1">${icon('layers')}<p>Nenhum ministério cadastrado.</p></div>`}
    </div>`;

  const editar = (m = { nome: '', descricao: '', cor: '#5b3df5', cd_status: 1 }) => modal({
    titulo: m.id ? 'Editar ministério' : 'Novo ministério',
    corpo: `<form id="fm" class="grid" style="gap:14px">
      <div class="field"><label>Nome *</label><input class="input" id="mn" required value="${esc(m.nome)}"></div>
      <div class="field"><label>Descrição</label><input class="input" id="md" value="${esc(m.descricao || '')}"></div>
      <div class="field"><label>Cor</label><input type="color" id="mc" value="${esc(m.cor || '#5b3df5')}" style="width:64px;height:40px;border:0;background:none;padding:0"></div>
      ${m.id ? `<label class="check"><input type="checkbox" id="ma" ${m.cd_status ? 'checked' : ''}> Ministério ativo</label>` : ''}
      <div class="modal-actions">${m.id && isAdmin() ? `<button type="button" class="btn btn-danger" id="mdel" style="margin-right:auto">${icon('trash')}</button>` : ''}
        <button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Salvar</button></div></form>`,
    onOpen: (el, fechar) => {
      el.querySelector('#mn').focus();
      el.querySelector('#fm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const dados = { nome: el.querySelector('#mn').value.trim(), descricao: el.querySelector('#md').value.trim() || null, cor: el.querySelector('#mc').value };
        if (!dados.nome) return toast('Informe o nome.', 'bad');
        if (m.id) dados.cd_status = el.querySelector('#ma').checked ? 1 : 0;
        await carregando(e.submitter, async () => {
          try {
            ok(m.id ? await sb.from('ministerios').update(dados).eq('id', m.id) : await sb.from('ministerios').insert(dados));
            toast('Ministério salvo!'); fechar(); render(content);
          } catch (err) { toastErro(err); }
        });
      });
      el.querySelector('#mdel')?.addEventListener('click', async () => {
        fechar();
        if (!(await confirmar(`Excluir o ministério ${m.nome}? As pessoas não serão apagadas, só o vínculo.`, { ok: 'Excluir', perigo: true }))) return;
        try { ok(await sb.from('ministerios').delete().eq('id', m.id)); toast('Ministério excluído.'); render(content); } catch (err) { toastErro(err); }
      });
    },
  });

  content.querySelector('#novo').onclick = () => editar();
  content.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editar(mins.find((m) => m.id === Number(b.dataset.edit)))));
}
