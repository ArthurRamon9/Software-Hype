// Agenda: reuniões dos ministérios, com convite no Google Agenda
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, sessao, preaquecer } from '../api.js';
import { esc, $, icon, aviso, avisoErro, ocupado, janela, confirmar, hojeISO } from '../ui.js';
import { abrirWhatsApp } from '../whats.js';

let periodo = 'proximas';
let filtroMin = '';
let entrada = '';   // de que lado a lista entra ao trocar de aba

const dataLonga = (iso) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase());
const hora = (iso) => iso.slice(11, 16).replace(':', 'h');
// Botão "+ Agenda": abre o Google Agenda já preenchido (não precisa de login no site do Hype)
function linkGoogle(r) {
  const d = (iso) => iso.replace(/[-:]/g, '').slice(0, 15);
  const p = new URLSearchParams({ action: 'TEMPLATE', text: `${r.titulo} (${r.ministerio})`, dates: `${d(r.inicio)}/${d(r.fim)}`, ctz: 'America/Sao_Paulo', details: r.descricao || '', location: r.local || '' });
  return `https://calendar.google.com/calendar/render?${p}`;
}

// Mensagem pronta para o grupo do ministério no WhatsApp
function mensagemReuniao(r) {
  const fim = r.fim && r.fim.slice(11, 16) !== r.inicio.slice(11, 16) ? ` às ${hora(r.fim)}` : '';
  return [`*${r.titulo}* (${r.ministerio})`, `${dataLonga(r.inicio.slice(0, 10) + 'T12:00:00')}, ${fim ? 'das' : 'às'} ${hora(r.inicio)}${fim}`,
    r.local ? `Local: ${r.local}` : '', r.descricao || '', '', `Colocar na agenda: ${linkGoogle(r)}`].filter((l, i, a) => l || (i > 0 && a[i - 1])).join('\n').trim();
}
// Depois de criar ou mudar: avisar o grupo do ministério (o WhatsApp abre para escolher o grupo)
function avisarNoGrupo(r, titulo) {
  janela({
    titulo,
    avisarAoSair: false,
    corpo: `<p style="margin:0 0 10px">Quer avisar o grupo do ${esc(r.ministerio)} no WhatsApp? A mensagem já vai pronta, é só escolher o grupo.</p>
      <pre class="msg-previa">${esc(mensagemReuniao(r))}</pre>
      <div class="janela-acoes"><button type="button" class="btn" data-fechar>Agora não</button><button type="button" class="btn primary" id="av-zap">${icon('whats')} Avisar no WhatsApp</button></div>`,
    aoAbrir: (j, fechar) => j.querySelector('#av-zap').addEventListener('click', () => { abrirWhatsApp(mensagemReuniao(r)); fechar(); }),
  });
}
// Reuniões que batem com este horário (de qualquer ministério que a pessoa vê)
const conflitos = (reunioes, data, ini, fim, semId) => {
  if (!data || !ini) return [];
  const a = `${data}T${ini}`, b = `${data}T${fim && fim > ini ? fim : `${String(Math.min(23, Number(ini.slice(0, 2)) + 1)).padStart(2, '0')}${ini.slice(2)}`}`;
  return reunioes.filter((x) => !x.cancelada && x.id !== semId && x.inicio.slice(0, 16) < b && x.fim.slice(0, 16) > a);
};

export async function render(conteudo) {
  const { reunioes, posso_criar: possoCriar, email_ativo: emailAtivo = true } = await api('GET', `/agenda?periodo=${periodo}`);
  preaquecer(`/agenda?periodo=${periodo === 'proximas' ? 'anteriores' : 'proximas'}`);   // a outra aba já fica pronta
  const meusMins = (sessao.usuario.ministerios || []).map((m) => m.nome);
  const lider = possoCriar.length > 0;
  const ministeriosNaLista = [...new Map(reunioes.map((r) => [r.ministerio_id, r.ministerio])).entries()];
  const lista = reunioes.filter((r) => !filtroMin || String(r.ministerio_id) === filtroMin);
  // Agrupa por dia
  const dias = [];
  for (const r of lista) { const dia = r.inicio.slice(0, 10); let g = dias.find((x) => x.dia === dia); if (!g) dias.push(g = { dia, itens: [] }); g.itens.push(r); }

  const reuniao = (r) => {
    const semEmail = r.pessoas.filter((p) => !p.tem_email).length;
    const convidados = r.pessoas.filter((p) => p.dt_convite).length;
    return `<div class="reuniao ${r.cancelada ? 'cancelada' : ''}" style="--c:${esc(r.cor)}">
      <div class="hora">${hora(r.inicio)}<span>Até ${hora(r.fim)}</span></div>
      <div class="cresce">
        <span class="min"><i></i>${esc(r.ministerio)}${r.cancelada ? ' · <b>Cancelada</b>' : ''}</span>
        <h3>${esc(r.titulo)}</h3>
        <div class="meta">${r.local ? `<span>${icon('local')}${esc(r.local)}</span>` : ''}
          <span>${icon('pessoas')}${r.pessoas.length} participante${r.pessoas.length === 1 ? '' : 's'}</span>
          ${r.cancelada ? '' : r.pode_editar ? `<span>${icon('email')}${convidados ? `Na agenda de ${convidados} pelo convite` : emailAtivo ? 'Convite ainda não enviado' : 'Convite não enviado (e-mail do site desligado)'}${semEmail ? ` · ${semEmail} sem e-mail` : ''}</span>` : r.eu_participo ? `<span>${icon('email')}Convite no seu e-mail</span>` : ''}
        </div>
        ${r.descricao ? `<p class="small muted" style="margin-top:6px">${esc(r.descricao)}</p>` : ''}
      </div>
      <div class="acoes-r">
        ${r.pode_editar && !r.cancelada && periodo === 'proximas' ? `<button class="btn-icone zap" data-zap="${r.id}" title="Avisar o grupo no WhatsApp" aria-label="Avisar o grupo no WhatsApp">${icon('zap')}</button>` : ''}
        ${!r.cancelada && periodo === 'proximas' ? `<a class="btn-icone" href="${linkGoogle(r)}" target="_blank" rel="noopener" title="Colocar no meu Google Agenda" aria-label="Colocar no meu Google Agenda">${icon('agendaMais')}</a>` : ''}
        ${r.pode_editar && !r.cancelada && periodo === 'proximas' ? `<button class="btn-icone" data-editar="${r.id}" title="Editar reunião" aria-label="Editar reunião">${icon('lapis')}</button>` : ''}
      </div></div>`;
  };

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Agenda</h1><p class="sub">${lider ? 'Reuniões de todos os ministérios, para marcar sem bater horário. Você altera as do seu.' : meusMins.length ? `Reuniões dos seus ministérios: ${esc(meusMins.join(', '))}.` : 'Reuniões dos ministérios do Hype.'}${possoCriar.length ? '' : ' Quem marca reuniões é o líder do ministério (marcado como líder em Ministérios).'}</p></div>
      <div class="acoes">${possoCriar.length ? '<button class="btn primary" id="nova">Nova reunião</button>' : ''}</div></div>
    ${!sessao.usuario.pessoa_id && !possoCriar.length ? '<p class="msg aviso" style="margin-bottom:14px">Sua conta ainda não está ligada ao seu cadastro do Hype, então ainda não dá para saber quais são os seus ministérios. Peça a um administrador para ligar.</p>' : ''}
    ${possoCriar.length && !emailAtivo ? '<p class="msg aviso" style="margin-bottom:14px">O e-mail do site não está ligado aqui, então os convites não saem. No site publicado (com o e-mail configurado na Netlify) eles chegam no e-mail e entram sozinhos no Google Agenda de cada participante.</p>' : ''}
    <div class="painel" style="margin-bottom:16px"><div class="filtros" style="justify-content:space-between">
      <div class="abas" id="periodo"><button data-p="proximas" class="${periodo === 'proximas' ? 'ativo' : ''}">Próximas</button><button data-p="anteriores" class="${periodo === 'anteriores' ? 'ativo' : ''}">Anteriores</button></div>
      ${ministeriosNaLista.length > 1 ? `<select class="input" id="f-min" style="width:auto"><option value="">Todos os ministérios</option>${ministeriosNaLista.map(([id, n]) => `<option value="${id}" ${filtroMin === String(id) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}
    </div></div>
    <div class="ag-lista ${entrada}">${dias.length ? dias.map((g) => `<div class="dia-grupo"><h2>${dataLonga(g.dia + 'T12:00:00')}</h2><section class="painel">${g.itens.map(reuniao).join('')}</section></div>`).join('')
      : `<div class="painel vazio"><b>${periodo === 'proximas' ? 'Nenhuma reunião marcada' : 'Nenhuma reunião anterior'}</b>${possoCriar.length && periodo === 'proximas' ? 'Use "Nova reunião" para marcar a próxima do seu ministério.' : 'Quando o líder do seu ministério marcar uma reunião, ela aparece aqui e o convite chega no seu e-mail.'}</div>`}</div>`;
  entrada = '';

  conteudo.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { if (periodo === b.dataset.p) return; entrada = b.dataset.p === 'anteriores' ? 'entra-esq' : 'entra-dir'; periodo = b.dataset.p; render(conteudo).catch(avisoErro); }));
  $('#f-min')?.addEventListener('change', (e) => { filtroMin = e.target.value; render(conteudo).catch(avisoErro); });
  $('#nova')?.addEventListener('click', async () => {
    // para avisar de horário batendo, compara com as próximas (mesmo se a aba aberta for a das anteriores)
    const prox = periodo === 'proximas' ? reunioes : (await api('GET', '/agenda?periodo=proximas').catch(() => ({ reunioes: [] }))).reunioes;
    editar(conteudo, null, possoCriar, prox);
  });
  conteudo.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editar(conteudo, reunioes.find((r) => r.id === Number(b.dataset.editar)), possoCriar, reunioes)));
  conteudo.querySelectorAll('[data-zap]').forEach((b) => b.addEventListener('click', () => abrirWhatsApp(mensagemReuniao(reunioes.find((r) => r.id === Number(b.dataset.zap))))));
}

async function editar(conteudo, r, possoCriar, reunioes = []) {
  const novo = !r;
  let mid = r ? r.ministerio_id : possoCriar[0].id;
  janela({
    titulo: novo ? 'Nova reunião' : 'Editar reunião',
    larga: true,
    corpo: `<form id="fr" class="form-r">
      <div class="field"><label for="r-min">Ministério *</label><select class="input" id="r-min" ${novo ? '' : 'disabled'}>${(novo ? possoCriar : [{ id: r.ministerio_id, nome: r.ministerio }]).map((m) => `<option value="${m.id}" ${m.id === mid ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div>
      <div class="field"><label for="r-tit">Título *</label><input class="input" id="r-tit" required maxlength="150" value="${esc(r?.titulo || '')}" placeholder="Ex.: Reunião da Pastoral"></div>
      <div class="field"><label for="r-data">Data *</label><input class="input" id="r-data" type="date" required min="${hojeISO()}" value="${r ? r.inicio.slice(0, 10) : ''}"></div>
      <div class="field duas"><div><label for="r-ini">Começa *</label><input class="input" id="r-ini" type="time" required value="${r ? r.inicio.slice(11, 16) : ''}"></div>
        <div><label for="r-fim">Termina</label><input class="input" id="r-fim" type="time" value="${r ? r.fim.slice(11, 16) : ''}"></div></div>
      <p class="msg aviso full" id="r-conflito" hidden></p>
      <div class="field full"><label for="r-local">Local ou link</label><input class="input" id="r-local" maxlength="250" value="${esc(r?.local || '')}" placeholder="Ex.: Sala 2 da igreja"></div>
      <div class="field full"><label for="r-desc">Descrição (opcional)</label><textarea class="input" id="r-desc" maxlength="1000">${esc(r?.descricao || '')}</textarea></div>
      <div class="field full"><div class="part-topo"><span class="label">Quem participa <span class="muted small" id="r-conta"></span></span><button type="button" class="link-btn" id="r-todos" hidden></button></div><div class="part" id="r-part"><span class="muted">Carregando…</span></div></div>
      <label class="field full envio check"><input type="checkbox" id="r-enviar" checked><span><b>${novo ? 'Enviar convite por e-mail' : 'Mandar a atualização por e-mail'}</b><small id="r-aviso-email">Chega como convite no Google Agenda (e no celular) de quem tem e-mail no cadastro. Se você mudar o horário ou cancelar, a agenda deles atualiza sozinha.</small></span></label>
      <div class="janela-acoes full" style="justify-content:space-between">
        ${novo ? '<span></span>' : '<button type="button" class="link-btn danger" id="cancelar-r">Cancelar a reunião</button>'}
        <div style="display:flex;gap:8px"><button type="button" class="btn" data-fechar>Fechar</button><button class="btn primary">${novo ? 'Criar' : 'Salvar'}</button></div>
      </div></form>`,
    aoAbrir: (j, fechar) => {
      const carregarMembros = async () => {
        const box = j.querySelector('#r-part');
        try {
          const membros = await api('GET', `/agenda/membros/${mid}`);
          const marcados = r ? new Set(r.pessoas.map((p) => p.id)) : new Set(membros.map((m) => m.id));
          box.innerHTML = membros.length ? membros.map((m) => `<label title="${esc(m.nome)}"><input type="checkbox" name="rp" value="${m.id}" ${marcados.has(m.id) ? 'checked' : ''}><span class="nome-p">${esc(m.nome)}</span>${m.tem_email ? '' : '<small>Sem e-mail</small>'}</label>`).join('')
            : '<span class="muted">Ninguém neste ministério ainda. Coloque as pessoas em Ministérios.</span>';
          contar();
          const sem = membros.filter((m) => !m.tem_email).map((m) => m.nome.split(' ')[0]);
          if (sem.length) j.querySelector('#r-aviso-email').textContent += ` ${sem.join(', ')} ${sem.length === 1 ? 'não tem' : 'não têm'} e-mail no cadastro: avise por WhatsApp.`;
        } catch (e) { box.innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
      };
      // "3 de 5 marcadas" + marcar/desmarcar todos
      const contar = () => {
        const todos = [...j.querySelectorAll('input[name=rp]')], n = todos.filter((c) => c.checked).length;
        j.querySelector('#r-conta').textContent = todos.length ? `· ${n} de ${todos.length}` : '';
        const bt = j.querySelector('#r-todos');
        bt.hidden = todos.length < 2;
        bt.textContent = n === todos.length ? 'Desmarcar todos' : 'Marcar todos';
      };
      j.querySelector('#r-part').addEventListener('change', contar);
      j.querySelector('#r-todos').addEventListener('click', () => {
        const todos = [...j.querySelectorAll('input[name=rp]')], marcar = todos.some((c) => !c.checked);
        todos.forEach((c) => { c.checked = marcar; });
        contar();
      });
      carregarMembros();
      // Escolheu o começo e o fim está vazio: sugere 1 hora depois
      j.querySelector('#r-ini').addEventListener('change', (e) => {
        const fim = j.querySelector('#r-fim'); const v = e.target.value;
        if (!v || fim.value) return;
        const [h, m] = v.split(':').map(Number);
        if (h < 23) fim.value = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      });
      j.querySelector('#r-min').addEventListener('change', (e) => { mid = Number(e.target.value); carregarMembros(); });
      // Avisa se já tem reunião (de qualquer ministério) nesse horário
      const verConflito = () => {
        const c = conflitos(reunioes, j.querySelector('#r-data').value, j.querySelector('#r-ini').value, j.querySelector('#r-fim').value, r?.id);
        const el = j.querySelector('#r-conflito');
        el.hidden = !c.length;
        el.innerHTML = c.length ? `Nesse horário já tem: ${c.map((x) => `<b>${esc(x.titulo)}</b> (${esc(x.ministerio)}, ${hora(x.inicio)} às ${hora(x.fim)})`).join('; ')}. Pode marcar assim mesmo.` : '';
      };
      ['#r-data', '#r-ini', '#r-fim'].forEach((s) => j.querySelector(s).addEventListener('change', verConflito));
      verConflito();
      j.querySelector('#fr').addEventListener('submit', async (e) => {
        e.preventDefault();
        const corpo = {
          ministerio_id: mid, titulo: j.querySelector('#r-tit').value, data: j.querySelector('#r-data').value,
          hora_inicio: j.querySelector('#r-ini').value, hora_fim: j.querySelector('#r-fim').value,
          local: j.querySelector('#r-local').value, descricao: j.querySelector('#r-desc').value,
          pessoas: [...j.querySelectorAll('input[name=rp]:checked')].map((c) => Number(c.value)),
          enviar: j.querySelector('#r-enviar').checked,
        };
        await ocupado(e.submitter, async () => {
          try {
            const res = await api(novo ? 'POST' : 'PUT', novo ? '/agenda' : `/agenda/${r.id}`, corpo);
            fechar(); render(conteudo).catch(avisoErro);
            const nomeMin = (novo ? possoCriar.find((m) => m.id === mid)?.nome : r.ministerio) || '';
            // Ao editar, só oferece avisar o grupo se mudou o dia, o horário ou o local
            const mudouQuando = novo || r.inicio.slice(0, 16) !== `${corpo.data}T${corpo.hora_inicio}` || (corpo.hora_fim && r.fim.slice(11, 16) !== corpo.hora_fim) || (r.local || '') !== corpo.local.trim();
            if (!mudouQuando) return aviso(`Reunião salva${corpo.enviar ? `: convite enviado a ${res.enviados}` : ''}.`);
            avisarNoGrupo({ titulo: corpo.titulo.trim(), ministerio: nomeMin, inicio: `${corpo.data}T${corpo.hora_inicio}:00`,
              fim: corpo.hora_fim ? `${corpo.data}T${corpo.hora_fim}:00` : '', local: corpo.local.trim(), descricao: corpo.descricao.trim() },
            `${novo ? 'Reunião criada' : 'Reunião salva'}${corpo.enviar ? `: convite enviado a ${res.enviados}` : ''}`);
          } catch (err) { avisoErro(err); }
        });
      });
      j.querySelector('#cancelar-r')?.addEventListener('click', async () => {
        fechar();
        if (!(await confirmar(`Cancelar "${r.titulo}"? Quem recebeu o convite é avisado por e-mail e a reunião sai da agenda deles.`, { botao: 'Cancelar reunião', perigo: true }))) return;
        // Mostra na hora (o aviso por e-mail pode demorar) e sempre redesenha no fim, mesmo se o e-mail falhar
        const card = conteudo.querySelector(`[data-editar="${r.id}"]`)?.closest('.reuniao');
        if (card) { card.classList.add('cancelada'); card.querySelectorAll('.btn-icone').forEach((b) => b.remove()); const min = card.querySelector('.min'); if (min && !min.querySelector('b')) min.insertAdjacentHTML('beforeend', ' · <b>Cancelada</b>'); }
        aviso('Cancelando e avisando quem foi convidado...');
        try { const res = await api('POST', `/agenda/${r.id}/cancelar`); aviso(`Reunião cancelada${res.avisados ? `. ${res.avisados} avisado${res.avisados === 1 ? '' : 's'} por e-mail` : ''}.`); } catch (err) { avisoErro(err); }
        render(conteudo).catch(avisoErro);
      });
    },
  });
}
