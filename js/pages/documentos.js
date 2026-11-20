// Documentos: as pastas de cada ministério no Google Drive e os documentos importantes (temas, pautas, estrutura)
// Os arquivos ficam no Drive. O site guarda só o link, o título e o assunto, para achar rápido.
// Abrir ou enviar arquivo é direto com o Google: não passa pelo nosso servidor.
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api } from '../api.js';
import { esc, $, icon, aviso, avisoErro, ocupado, janela, confirmar, fmtData, hojeISO, semAcento } from '../ui.js';

let busca = '';
let filtroMin = '';

// Tipo do arquivo pelo link do Google (só para mostrar um rótulo amigável)
function tipoDoLink(url) {
  if (/\/folders\//.test(url)) return 'Pasta';
  if (/\/document\//.test(url)) return 'Documento';
  if (/\/spreadsheets\//.test(url)) return 'Planilha';
  if (/\/presentation\//.test(url)) return 'Apresentação';
  if (/\/forms\//.test(url)) return 'Formulário';
  return 'Arquivo';
}
const abrir = (url, rotulo = 'Abrir no Drive') => `<a class="btn-icone" href="${esc(url)}" target="_blank" rel="noopener" title="${rotulo}" aria-label="${rotulo}" data-nao-editar>${icon('externo')}</a>`;

export async function render(conteudo) {
  const dados = await api('GET', '/documentos');
  const { ministerios, documentos, pasta_geral: geral } = dados;
  const recarregar = () => render(conteudo).catch(avisoErro);
  const nomeMin = (id) => ministerios.find((m) => m.id === id)?.nome || 'Geral';
  const corMin = (id) => ministerios.find((m) => m.id === id)?.cor || 'var(--muted)';
  const podeAdicionar = dados.pode_geral || ministerios.some((m) => m.pode_editar);

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Documentos</h1><p class="sub">As pastas dos ministérios no Google Drive e os documentos importantes, como temas de reunião e a estrutura de cada ministério.</p></div>
      <div class="acoes">${podeAdicionar ? `<button class="btn primary" id="doc-novo">${icon('plus')} Adicionar documento</button>` : ''}</div></div>
    <section class="painel">
      <div class="painel-topo"><h2>Pastas no Drive</h2><span class="sub">Abra para ver ou enviar arquivos direto no Google Drive</span></div>
      <div class="painel-corpo"><div class="pastas">
        ${geral || dados.pode_pasta_geral ? (() => {
          const miolo = `${icon('pasta')}<div class="cresce"><b>Geral do Hype</b><span>${geral ? 'Supervisão e todos os ministérios' : 'Ainda sem link'}</span></div>`;
          const lapis = dados.pode_pasta_geral ? `<button type="button" class="btn-icone" id="pasta-geral" title="${geral ? 'Trocar o link' : 'Colocar o link'} da pasta geral">${icon('lapis')}</button>` : '';
          return geral
            ? `<a class="pasta geral link" href="${esc(geral)}" target="_blank" rel="noopener" title="Abrir a pasta geral no Drive">${miolo}${lapis}<span class="pasta-seta">${icon('externo')}</span></a>`
            : `<div class="pasta geral sem-link">${miolo}${lapis}</div>`; })() : ''}
        ${ministerios.map((m) => { const n = documentos.filter((d) => d.ministerio_id === m.id).length;
          const miolo = `${icon('pasta')}<div class="cresce"><b>${esc(m.nome)}</b><span>${m.drive_url ? (n ? `${n} documento${n === 1 ? '' : 's'} em destaque` : 'Abrir no Drive') : 'Pasta ainda não ligada'}</span></div>`;
          return m.drive_url
            ? `<a class="pasta link" style="--c:${esc(m.cor)}" href="${esc(m.drive_url)}" target="_blank" rel="noopener" title="Abrir a pasta da ${esc(m.nome)} no Drive">${miolo}<span class="pasta-seta">${icon('externo')}</span></a>`
            : `<div class="pasta sem-link" style="--c:${esc(m.cor)}">${miolo}</div>`; }).join('') || '<p class="muted">Você ainda não está em nenhum ministério.</p>'}
      </div>
      <p class="hint" style="margin-top:12px">${ministerios.some((m) => !m.drive_url) ? 'Para ligar a pasta de um ministério: Ministérios → Editar → "Pasta no Google Drive". ' : ''}Quem não tiver acesso à pasta no Drive pode pedir por lá mesmo, ao abrir.</p></div>
    </section>
    <section class="painel mt">
      <div class="painel-topo"><h2>Documentos importantes</h2><span class="sub">Temas e assuntos das reuniões, estrutura dos ministérios, modelos...</span></div>
      <div class="filtros">
        <input class="input busca" id="doc-busca" type="search" placeholder="Buscar por título ou assunto" value="${esc(busca)}">
        <select class="input" id="doc-min" aria-label="Ministério"><option value="">Todos</option><option value="geral" ${filtroMin === 'geral' ? 'selected' : ''}>Geral</option>${ministerios.map((m) => `<option value="${m.id}" ${filtroMin === String(m.id) ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select>
      </div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Documento</th><th class="some-mobile">Assunto</th><th class="some-mobile">Ministério</th><th>Data</th><th class="dir"></th></tr></thead>
        <tbody id="doc-linhas"></tbody></table></div>
      <div class="filtros" style="border-top:1px solid var(--line);border-bottom:0"><span class="muted small" id="doc-total"></span></div>
    </section>`;

  const podeMexer = (d) => (d.ministerio_id ? ministerios.find((m) => m.id === d.ministerio_id)?.pode_editar : dados.pode_geral);
  const pintar = () => {
    const b = semAcento(busca);
    const l = documentos.filter((d) => (!filtroMin || (filtroMin === 'geral' ? !d.ministerio_id : String(d.ministerio_id) === filtroMin))
      && (!b || semAcento(`${d.titulo} ${d.assunto || ''}`).includes(b)));
    $('#doc-total').textContent = `${l.length} documento${l.length === 1 ? '' : 's'}`;
    $('#doc-linhas').innerHTML = l.length ? l.map((d) => `<tr class="${podeMexer(d) ? 'clicavel' : ''}" data-id="${d.id}">
        <td><b>${esc(d.titulo)}</b><span class="doc-tipo">${tipoDoLink(d.url)}</span></td>
        <td class="some-mobile muted small doc-assunto">${esc(d.assunto || '')}</td>
        <td class="some-mobile small"><span class="ponto" style="background:${esc(corMin(d.ministerio_id))};margin-right:6px"></span>${esc(nomeMin(d.ministerio_id))}</td>
        <td class="small" style="white-space:nowrap">${d.data ? fmtData(d.data) : '—'}</td>
        <td class="dir">${abrir(d.url)}</td></tr>`).join('')
      : `<tr><td colspan="5" class="vazio">${documentos.length ? 'Nada com esse filtro.' : `<b>Nenhum documento destacado ainda</b>${podeAdicionar ? 'Use "Adicionar documento" e cole o link do arquivo no Drive.' : 'Quando o líder do seu ministério adicionar, aparece aqui.'}`}</td></tr>`;
  };
  pintar();

  $('#doc-busca').addEventListener('input', (e) => { busca = e.target.value; pintar(); });
  $('#doc-min').addEventListener('change', (e) => { filtroMin = e.target.value; pintar(); });
  $('#doc-novo')?.addEventListener('click', () => editar(null, dados, recarregar));
  $('#doc-linhas').addEventListener('click', (e) => {
    if (e.target.closest('[data-nao-editar]')) return;
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const d = documentos.find((x) => x.id === Number(tr.dataset.id));
    if (podeMexer(d)) editar(d, dados, recarregar);
  });
  $('#pasta-geral')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); janela({
    titulo: 'Pasta geral no Drive',
    corpo: `<form id="fg" style="display:grid;gap:12px"><div class="field"><label for="fg-url">Link da pasta</label><input class="input" id="fg-url" value="${esc(geral || '')}" placeholder="https://drive.google.com/drive/folders/..."></div>
      <p class="hint">No Drive: botão direito na pasta → Compartilhar → Copiar link. Deixe vazio para tirar.</p>
      <div class="janela-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Salvar</button></div></form>`,
    aoAbrir: (j, fechar) => j.querySelector('#fg').addEventListener('submit', async (e) => {
      e.preventDefault();
      await ocupado(e.submitter, async () => { try { await api('PUT', '/documentos/pasta-geral', { url: j.querySelector('#fg-url').value }); aviso('Pasta geral salva.'); fechar(); recarregar(); } catch (err) { avisoErro(err); } });
    }),
  }); });
}

function editar(d, dados, depois) {
  const novo = !d;
  const opcoes = [...(dados.pode_geral ? [{ id: '', nome: 'Geral (todos veem)' }] : []), ...dados.ministerios.filter((m) => m.pode_editar)];
  janela({
    titulo: novo ? 'Adicionar documento' : 'Editar documento',
    corpo: `<form id="fd" style="display:grid;gap:14px">
      <div class="field"><label for="fd-url">Link no Google Drive *</label><input class="input" id="fd-url" required value="${esc(d?.url || '')}" placeholder="Cole o link (no Drive: Compartilhar → Copiar link)">
        <span class="hint" id="fd-tipo">${d ? tipoDoLink(d.url) : 'PDF, Word, Excel, apresentação ou uma pasta: o arquivo continua no Drive.'}</span></div>
      <div class="form-r">
        <div class="field full"><label for="fd-tit">Título *</label><input class="input" id="fd-tit" required maxlength="200" value="${esc(d?.titulo || '')}" placeholder="Ex.: Reunião de líderes de novembro"></div>
        <div class="field"><label for="fd-min">Ministério</label><select class="input" id="fd-min">${opcoes.map((m) => `<option value="${m.id}" ${String(d?.ministerio_id ?? '') === String(m.id) ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div>
        <div class="field"><label for="fd-data">Data</label><input class="input" id="fd-data" type="date" value="${d?.data || (novo ? hojeISO() : '')}"></div>
        <div class="field full"><label for="fd-ass">Temas e assuntos</label><textarea class="input" id="fd-ass" maxlength="500" placeholder="Ex.: Escala de dezembro, retiro, novos visitantes">${esc(d?.assunto || '')}</textarea></div>
      </div>
      <div class="janela-acoes rodape-acoes">
        ${!novo ? `<button type="button" class="link-btn danger com-icone" id="fd-apagar">${icon('lixeira')}Tirar do site</button>` : '<span></span>'}
        <div class="dir-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">${novo ? 'Adicionar' : 'Salvar'}</button></div></div></form>`,
    aoAbrir: (j, fechar) => {
      const url = j.querySelector('#fd-url');
      url.addEventListener('input', () => { if (/^https:\/\/(drive|docs)\.google\.com\//.test(url.value.trim())) j.querySelector('#fd-tipo').textContent = `${tipoDoLink(url.value)} do Google Drive`; });
      (novo ? url : j.querySelector('#fd-tit')).focus();
      j.querySelector('#fd').addEventListener('submit', async (e) => {
        e.preventDefault();
        const corpo = { url: url.value, titulo: j.querySelector('#fd-tit').value, ministerio_id: j.querySelector('#fd-min').value || null, data: j.querySelector('#fd-data').value, assunto: j.querySelector('#fd-ass').value };
        await ocupado(e.submitter, async () => {
          try { await api(novo ? 'POST' : 'PUT', novo ? '/documentos' : `/documentos/${d.id}`, corpo); aviso(novo ? 'Documento adicionado.' : 'Documento salvo.'); fechar(); depois(); } catch (err) { avisoErro(err); }
        });
      });
      j.querySelector('#fd-apagar')?.addEventListener('click', async () => {
        if (!(await confirmar(`Tirar "${d.titulo}" do site? O arquivo continua no Google Drive.`, { botao: 'Tirar do site', perigo: true }))) return;
        try { await api('DELETE', `/documentos/${d.id}`); aviso('Documento tirado do site.'); fechar(); depois(); } catch (err) { avisoErro(err); }
      });
    },
  });
}
