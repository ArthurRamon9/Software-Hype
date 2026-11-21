// Sugestões: qualquer pessoa com acesso manda ideias e melhorias para o site.
// Quem cuida do site (sugestoes.gerenciar) aceita ou recusa; o que foi aceito vira a fila de trabalho (sprint):
// a fazer -> fazendo -> feita. A resposta aparece na própria sugestão para quem mandou.
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api } from '../api.js';
import { esc, $, icon, aviso, avisoErro, ocupado, janela, confirmar, haQuanto, semAcento } from '../ui.js';
import { baixarXLSX } from '../xlsx.js';
import { atualizarContadores } from '../app.js';

const TIPOS = { melhoria: 'Melhoria', ideia: 'Ideia nova', problema: 'Algo com erro' };
const STATUS = { nova: 'Aguardando resposta', aceita: 'A fazer', fazendo: 'Fazendo', feita: 'Feita', recusada: 'Recusada' };
const CLASSE = { nova: '', aceita: 'warn', fazendo: 'warn', feita: 'ok', recusada: 'bad' };
const ABA_DO_STATUS = { nova: 'nova', aceita: 'fila', fazendo: 'fila', feita: 'feita', recusada: 'recusada' };

let aba = null;
let busca = '';
let soMinhas = false;

export async function render(conteudo) {
  const { itens, gerencia } = await api('GET', '/sugestoes');
  // Depois de mexer: redesenha e atualiza o número de novas no menu
  const recarregar = () => { if (gerencia) atualizarContadores(); return render(conteudo).catch(avisoErro); };
  const conta = (a) => itens.filter((i) => ABA_DO_STATUS[i.status] === a).length;
  // Abre na primeira aba que tem algo (novas -> fila -> feitas)
  if (!aba) aba = ['nova', 'fila', 'feita'].find((k) => conta(k)) || 'nova';
  const ABAS = [['nova', 'Novas'], ['fila', gerencia ? 'Sprint' : 'Na fila'], ['feita', 'Feitas'], ...(conta('recusada') ? [['recusada', 'Recusadas']] : [])];
  if (!ABAS.some(([k]) => k === aba)) aba = 'nova';

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Sugestões</h1><p class="sub">${gerencia
      ? 'O que o pessoal sugeriu para o site. Aceite para colocar na sua fila de trabalho (sprint) ou recuse com um recado.'
      : 'Tem uma ideia ou viu algo que pode melhorar no site? Mande aqui. A resposta aparece na própria sugestão.'}</p></div>
      <div class="acoes">
        ${gerencia ? '<button class="btn" id="sug-planilha">Baixar planilha</button>' : ''}
        <button class="btn primary" id="sug-nova">${icon('plus')} Nova sugestão</button>
      </div></div>
    <section class="painel">
      <div class="filtros" style="justify-content:space-between">
        <div class="abas" id="sug-abas">${ABAS.map(([k, r]) => `<button data-a="${k}" class="${aba === k ? 'ativo' : ''}">${r}<span class="sug-n">${conta(k)}</span></button>`).join('')}</div>
      </div>
      <div class="filtros">
        <input class="input busca" id="sug-busca" type="search" placeholder="Buscar sugestão" value="${esc(busca)}">
        <label class="check small"><input type="checkbox" id="sug-minhas" ${soMinhas ? 'checked' : ''}> Só as minhas</label>
      </div>
      <div id="sug-lista" class="sug-lista"></div>
    </section>`;

  const pintar = () => {
    const b = semAcento(busca);
    const l = itens.filter((i) => ABA_DO_STATUS[i.status] === aba && (!soMinhas || i.minha) && (!b || semAcento(`${i.titulo} ${i.detalhe || ''} ${i.autor || ''}`).includes(b)));
    // Na fila: primeiro o que está sendo feito, depois o que foi aceito antes
    if (aba === 'fila') l.sort((x, y) => (x.status === 'fazendo' ? 0 : 1) - (y.status === 'fazendo' ? 0 : 1) || String(x.dt_status || '').localeCompare(String(y.dt_status || '')));
    if (aba === 'feita') l.sort((x, y) => String(y.dt_status || '').localeCompare(String(x.dt_status || '')));
    const vazio = {
      nova: gerencia ? '<b>Nenhuma sugestão esperando resposta</b>Quando alguém mandar uma, ela aparece aqui e no número do menu.' : '<b>Nenhuma sugestão nova</b>Use "Nova sugestão" para mandar a sua.',
      fila: gerencia ? '<b>Sprint vazia</b>Aceite uma sugestão em "Novas" para ela entrar aqui.' : '<b>Nada na fila ainda</b>As sugestões aceitas aparecem aqui até ficarem prontas.',
      feita: '<b>Nada pronto ainda</b>O que for feito no site a partir das sugestões aparece aqui.',
      recusada: '<b>Nenhuma sugestão recusada</b>',
    };
    $('#sug-lista').innerHTML = l.length ? l.map((i) => cartao(i, gerencia)).join('')
      : `<div class="vazio">${itens.some((i) => ABA_DO_STATUS[i.status] === aba) ? 'Nada com esse filtro.' : vazio[aba]}</div>`;
  };
  pintar();

  conteudo.querySelectorAll('#sug-abas [data-a]').forEach((b) => b.addEventListener('click', () => {
    aba = b.dataset.a;
    conteudo.querySelectorAll('#sug-abas [data-a]').forEach((x) => x.classList.toggle('ativo', x === b));
    pintar();
  }));
  $('#sug-busca').addEventListener('input', (e) => { busca = e.target.value; pintar(); });
  $('#sug-minhas').addEventListener('change', (e) => { soMinhas = e.target.checked; pintar(); });
  $('#sug-nova').addEventListener('click', () => editar(null, gerencia, recarregar));
  $('#sug-planilha')?.addEventListener('click', () => baixarXLSX('sugestoes-hype', [
    { nome: 'Sugestões', linhas: [['Sugestão', 'Detalhes', 'Tipo', 'Situação', 'Quem sugeriu', 'Enviada em', 'Resposta'],
      ...itens.map((i) => [i.titulo, i.detalhe || '', TIPOS[i.tipo], STATUS[i.status], i.autor || '', String(i.dt_criacao).slice(0, 10), i.resposta || ''])] },
  ]));

  $('#sug-lista').addEventListener('click', async (e) => {
    const card = e.target.closest('[data-id]'); if (!card) return;
    const i = itens.find((x) => x.id === Number(card.dataset.id));
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (!acao) { if (gerencia || (i.minha && i.status === 'nova')) editar(i, gerencia, recarregar); return; }
    if (acao === 'recusar') return recusar(i, recarregar);
    const btn = e.target.closest('[data-acao]');
    const msg = { aceita: 'Foi para a sprint.', fazendo: 'Marcada como "Fazendo".', feita: 'Marcada como feita.', nova: 'Voltou para as novas.' };
    await ocupado(btn, async () => {
      try { await api('PUT', `/sugestoes/${i.id}`, { status: acao }); aviso(msg[acao] || 'Pronto.'); recarregar(); } catch (err) { avisoErro(err); }
    });
  });
}

function cartao(i, gerencia) {
  const botoes = !gerencia ? '' : {
    nova: `<button class="btn sm primary" data-acao="aceita">${icon('check')} Aceitar</button><button class="btn sm" data-acao="recusar">Recusar</button>`,
    aceita: '<button class="btn sm" data-acao="fazendo">Começar</button>',
    fazendo: `<button class="btn sm primary" data-acao="feita">${icon('check')} Feita</button>`,
    feita: '',
    recusada: '<button class="btn sm" data-acao="nova">Reabrir</button>',
  }[i.status];
  const clicavel = gerencia || (i.minha && i.status === 'nova');
  return `<article class="sug ${clicavel ? 'clicavel' : ''}" data-id="${i.id}">
    <div class="sug-corpo">
      <div class="sug-topo"><b>${esc(i.titulo)}</b></div>
      ${i.detalhe ? `<p class="sug-detalhe">${esc(i.detalhe)}</p>` : ''}
      <div class="sug-pe"><span class="tag sug-tipo t-${i.tipo}">${TIPOS[i.tipo]}</span>
        <span class="tag ${CLASSE[i.status]}">${STATUS[i.status]}</span>
        <span class="muted small">${i.minha ? 'Você' : esc(i.autor || 'Conta apagada')} · ${haQuanto(i.dt_criacao)}</span></div>
      ${i.resposta ? `<div class="sug-resposta"><b>Resposta</b>${esc(i.resposta)}</div>` : ''}
    </div>
    ${botoes ? `<div class="sug-acoes">${botoes}</div>` : ''}
  </article>`;
}

// Recusar pede um recado opcional (quem sugeriu vê o motivo)
function recusar(i, depois) {
  janela({
    titulo: 'Recusar sugestão',
    corpo: `<form id="sr" style="display:grid;gap:14px">
      <p><b>${esc(i.titulo)}</b></p>
      <div class="field"><label for="sr-resp">Recado para quem sugeriu</label>
        <textarea class="input" id="sr-resp" rows="3" maxlength="500" placeholder="Ex.: Já dá para fazer isso em Relatórios → Baixar planilha.">${esc(i.resposta || '')}</textarea>
        <span class="hint">Opcional, mas ajuda a pessoa a entender.</span></div>
      <div class="janela-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn danger">Recusar</button></div></form>`,
    aoAbrir: (j, fechar) => {
      j.querySelector('#sr-resp').focus();
      j.querySelector('#sr').addEventListener('submit', async (e) => {
        e.preventDefault();
        await ocupado(e.submitter, async () => {
          try { await api('PUT', `/sugestoes/${i.id}`, { status: 'recusada', resposta: j.querySelector('#sr-resp').value }); aviso('Sugestão recusada.'); fechar(); depois(); } catch (err) { avisoErro(err); }
        });
      });
    },
  });
}

// ---------- Nova / corrigir sugestão ----------
// Quem gerencia também escolhe a situação e escreve a resposta
function editar(i, gerencia, depois) {
  const nova = !i;
  const podeApagar = !nova && (gerencia || (i.minha && i.status === 'nova'));
  janela({
    titulo: nova ? 'Nova sugestão' : 'Sugestão',
    corpo: `<form id="sf" style="display:grid;gap:14px">
      <div class="field"><span class="label">É sobre</span>
        <div class="abas" id="sf-tipo">${Object.entries(TIPOS).map(([k, r]) => `<button type="button" data-t="${k}" class="${(i?.tipo || 'melhoria') === k ? 'ativo' : ''}">${r}</button>`).join('')}</div></div>
      <div class="field"><label for="sf-titulo">Sugestão *</label>
        <input class="input" id="sf-titulo" maxlength="150" required value="${esc(i?.titulo || '')}" placeholder="Ex.: Avisar no WhatsApp quando eu for escalado"></div>
      <div class="field"><label for="sf-detalhe">Detalhes</label>
        <textarea class="input" id="sf-detalhe" rows="4" maxlength="2000" placeholder="Conte como seria, em que tela, e por que ajudaria.">${esc(i?.detalhe || '')}</textarea></div>
      ${gerencia && !nova ? `
      <div class="field"><label for="sf-status">Situação</label>
        <select class="input" id="sf-status">${Object.entries(STATUS).map(([k, r]) => `<option value="${k}" ${i.status === k ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="field"><label for="sf-resp">Resposta para quem sugeriu</label>
        <textarea class="input" id="sf-resp" rows="2" maxlength="500" placeholder="Aparece na sugestão. Ex.: Vai na próxima atualização.">${esc(i.resposta || '')}</textarea></div>
      <p class="hint">Sugerida por ${esc(i.minha ? 'você' : (i.autor || 'conta apagada'))} ${haQuanto(i.dt_criacao)}.</p>` : ''}
      ${nova && !gerencia ? '<p class="hint">Quem cuida do site lê todas. Enquanto ninguém responder, você pode corrigir ou apagar a sua.</p>' : ''}
      <div class="janela-acoes rodape-acoes">
        ${podeApagar ? `<button type="button" class="link-btn danger com-icone" id="sf-apagar">${icon('lixeira')}Apagar</button>` : '<span></span>'}
        <div class="dir-acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">${nova ? 'Enviar' : 'Salvar'}</button></div></div></form>`,
    aoAbrir: (j, fechar) => {
      let tipo = i?.tipo || 'melhoria';
      j.querySelector('#sf-tipo').addEventListener('click', (e) => {
        const b = e.target.closest('[data-t]'); if (!b) return;
        tipo = b.dataset.t; j.alterou = true;
        j.querySelectorAll('#sf-tipo [data-t]').forEach((x) => x.classList.toggle('ativo', x === b));
      });
      j.querySelector('#sf-titulo').focus();
      j.querySelector('#sf').addEventListener('submit', async (e) => {
        e.preventDefault();
        const corpo = { tipo, titulo: j.querySelector('#sf-titulo').value, detalhe: j.querySelector('#sf-detalhe').value };
        if (gerencia && !nova) Object.assign(corpo, { status: j.querySelector('#sf-status').value, resposta: j.querySelector('#sf-resp').value });
        await ocupado(e.submitter, async () => {
          try {
            await api(nova ? 'POST' : 'PUT', nova ? '/sugestoes' : `/sugestoes/${i.id}`, corpo);
            aviso(nova ? 'Sugestão enviada. Obrigado!' : 'Sugestão salva.');
            if (nova) aba = 'nova';
            fechar(); depois();
          } catch (err) { avisoErro(err); }
        });
      });
      j.querySelector('#sf-apagar')?.addEventListener('click', async () => {
        if (!(await confirmar(`Apagar a sugestão "${i.titulo}"?`, { botao: 'Apagar', perigo: true }))) return;
        try { await api('DELETE', `/sugestoes/${i.id}`); aviso('Sugestão apagada.'); fechar(); depois(); } catch (err) { avisoErro(err); }
      });
    },
  });
}
