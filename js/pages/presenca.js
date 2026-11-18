// Chamada dos encontros de sexta
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, urlFoto, pode } from '../api.js';
import { esc, $, aviso, avisoErro, ocupado, confirmar, janela, foto, TIPOS, isoLocal, parseISO, ultimaSexta, fmtData, hojeISO, semAcento, estaNoHype } from '../ui.js';
import { atualizarContadores, navegar } from '../app.js';

let dataSel = null;

export async function render(conteudo) {
  dataSel = dataSel || isoLocal(ultimaSexta());
  await desenhar(conteudo);
  const sairSemSalvar = (e) => { if (conteudo.dataset.alterado === '1') { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', sairSemSalvar);
  return () => window.removeEventListener('beforeunload', sairSemSalvar);
}

async function desenhar(conteudo) {
  const { encontro, pessoas, registros } = await api('GET', `/presenca?data=${dataSel}`);
  let lista = pessoas;
  const marca = new Map(registros.map((r) => [r.pessoa_id, r.presente]));
  const just = new Map(registros.filter((r) => r.justificativa).map((r) => [r.pessoa_id, r.justificativa]));
  let busca = '';
  conteudo.dataset.alterado = '0';
  const alterou = () => { conteudo.dataset.alterado = '1'; };
  const dia = parseISO(dataSel).toLocaleDateString('pt-BR', { weekday: 'long' });

  conteudo.innerHTML = `
    <div class="cabecalho"><div><h1>Presença</h1><p class="sub">${encontro ? 'Chamada já salva. Você pode corrigir e salvar de novo.' : 'Chamada ainda não feita nesta data.'}</p></div>
      <div class="acoes"><button class="btn" id="visitante">Novo visitante</button></div></div>
    <div class="painel">
      <div class="chamada-topo">
        <div class="data">
          <button class="btn sm" id="ant" title="Sexta anterior">‹</button>
          <input type="date" class="input" id="data" value="${dataSel}">
          <button class="btn sm" id="prox" title="Próxima sexta">›</button>
          <span class="muted small" style="margin-left:6px">${dia}</span>
        </div>
        <span class="contagem" id="contagem"></span>
      </div>
      <div class="filtros">
        <input class="input busca" id="busca" type="search" placeholder="Procurar nome (a busca acha também quem está afastado)">
        <input class="input" id="tema" placeholder="Tema da noite (opcional)" value="${esc(encontro?.tema || '')}" style="flex:1;min-width:200px">
      </div>
      <div class="chamada" id="chamada"></div>
      <div class="barra-salvar">
        <button class="link-btn" id="resto">Restantes como falta</button>
        <button class="btn primary" id="salvar">Salvar chamada</button>
      </div>
    </div>
    ${encontro && pode('presenca.excluir') ? '<p style="margin-top:14px"><button class="link-btn danger small" id="apagar">Apagar a chamada desta data</button></p>' : ''}`;

  const contar = () => {
    let p = 0, f = 0;
    lista.forEach((x) => { const v = marca.get(x.id); if (v === true) p++; else if (v === false) f++; });
    const resto = lista.filter((x) => esperado(x) && !marca.has(x.id)).length;
    $('#contagem').innerHTML = `<span class="p">${p} presente${p === 1 ? '' : 's'}</span><span class="f">${f} ausente${f === 1 ? '' : 's'}</span>${resto ? `<span>${resto} sem marcar</span>` : ''}`;
  };
  const linha = (p) => {
    const v = marca.get(p.id), j = just.get(p.id);
    return `<div data-id="${p.id}" class="${v === true ? 'marcado-p' : v === false ? 'marcado-f' : ''}">${foto(p.nome, urlFoto(p.id, p.foto_v))}
      <div class="nome"><b>${esc(p.nome)}${p.referencia ? ` <span class="ref">${esc(p.referencia)}</span>` : ''}</b><span>${TIPOS[p.tipo]}${v === false ? ` · <button class="link-btn small" data-just>${j ? esc(j) : 'justificar'}</button>` : ''}</span></div>
      <div class="pf"><button data-v="1" class="${v === true ? 'p' : ''}" aria-label="Presente">P</button><button data-v="0" class="${v === false ? 'f' : ''}" aria-label="Ausente">F</button></div></div>`;
  };
  // A chamada mostra quem está "no Hype" (veio nos últimos 3 meses ou acabou de ser cadastrado).
  // Quem está afastado ou é ex-visitante aparece na busca; se for marcado, entra na lista.
  const esperado = (p) => p.tipo !== 'ex_visitante' && p.cd_status === 1 && estaNoHype(p);
  const visiveis = () => {
    const b = semAcento(busca);
    return lista.filter((p) => (b ? semAcento(`${p.nome} ${p.referencia || ''}`).includes(b) : (esperado(p) || marca.has(p.id))));
  };
  const pintar = () => {
    const v = visiveis();
    $('#chamada').innerHTML = v.length ? v.map(linha).join('') : `<div class="vazio">${lista.length ? 'Ninguém com esse nome.' : '<b>Ninguém para chamar ainda</b>Cadastre as pessoas na aba Pessoas (ou importe a planilha) e volte aqui.'}</div>`;
    contar();
  };
  const repintarLinha = (pid) => { const el = $(`#chamada [data-id="${pid}"]`); if (el) el.outerHTML = linha(lista.find((x) => x.id === pid)); contar(); };
  pintar();

  $('#chamada').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const pid = Number(b.closest('[data-id]').dataset.id);
    if (b.hasAttribute('data-just')) {
      return janela({
        titulo: 'Motivo da falta',
        corpo: `<input class="input" id="jt" value="${esc(just.get(pid) || '')}" placeholder="Ex.: viagem, trabalho, doente">
          <div class="janela-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn primary" id="jok">Ok</button></div>`,
        aoAbrir: (j, fechar) => {
          const inp = j.querySelector('#jt'); inp.focus();
          const ok = () => { const t = inp.value.trim(); if (t) just.set(pid, t); else just.delete(pid); alterou(); fechar(); repintarLinha(pid); };
          j.querySelector('#jok').onclick = ok;
          inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ok(); });
        },
      });
    }
    const presente = b.dataset.v === '1';
    if (marca.get(pid) === presente) marca.delete(pid); else marca.set(pid, presente);
    if (presente) just.delete(pid);
    alterou(); repintarLinha(pid);
  });

  $('#busca').addEventListener('input', (e) => { busca = e.target.value; pintar(); });
  $('#tema').addEventListener('input', alterou);
  // "Restantes como falta" só marca quem era esperado na sexta (no Hype), não os afastados
  $('#resto').onclick = () => { lista.forEach((p) => { if (!marca.has(p.id) && esperado(p)) marca.set(p.id, false); }); alterou(); pintar(); };

  const irPara = async (nova) => {
    if (conteudo.dataset.alterado === '1' && !(await confirmar('Você tem marcações não salvas nesta data. Trocar mesmo assim?', { botao: 'Trocar' }))) { $('#data').value = dataSel; return; }
    dataSel = nova;
    conteudo.innerHTML = '<div class="boot"><span class="spin"></span></div>';
    try { await desenhar(conteudo); } catch (err) { avisoErro(err); }
  };
  const somar = (d) => { const x = parseISO(dataSel); x.setDate(x.getDate() + d); return isoLocal(x); };
  $('#data').addEventListener('change', (e) => e.target.value && irPara(e.target.value));
  $('#ant').onclick = () => irPara(somar(-7));
  $('#prox').onclick = () => irPara(somar(7));

  $('#visitante').onclick = () => janela({
    titulo: 'Novo visitante',
    corpo: `<form id="fv" style="display:grid;gap:12px">
      <div class="field"><label for="vn">Nome *</label><input class="input" id="vn" required></div>
      <div class="field"><label for="vt">Telefone (WhatsApp)</label><input class="input" id="vt" type="tel"></div>
      <div class="field"><label for="vd">Data de nascimento</label><input class="input" id="vd" type="date" max="${hojeISO()}"></div>
      <div class="field"><label for="vc">Como conheceu o Hype</label><input class="input" id="vc"></div>
      <p class="hint">Fica marcado como presente nesta chamada. O resto do cadastro pode ser completado depois.</p>
      <div class="janela-acoes" style="margin-top:4px"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary">Cadastrar</button></div></form>`,
    aoAbrir: (j, fechar) => {
      j.querySelector('#vn').focus();
      j.querySelector('#fv').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const nome = j.querySelector('#vn').value.trim();
        if (nome.length < 2) return aviso('Informe o nome.', 'erro');
        await ocupado(ev.submitter, async () => {
          try {
            const r = await api('POST', '/pessoas', { nome, tipo: 'novo_visitante', telefone: j.querySelector('#vt').value, data_nascimento: j.querySelector('#vd').value || null, como_conheceu: j.querySelector('#vc').value, data_cadastro: dataSel });
            lista = [...lista, { id: r.id, nome, tipo: 'novo_visitante', cd_status: 1, data_cadastro: dataSel }].sort((a, b) => a.nome.localeCompare(b.nome));
            marca.set(r.id, true); alterou(); fechar(); pintar();
            aviso(`${nome.split(' ')[0]} cadastrado(a). Não esqueça de salvar a chamada.`);
          } catch (err) { avisoErro(err); }
        });
      });
    },
  });

  $('#apagar')?.addEventListener('click', async () => {
    if (!(await confirmar(`Apagar toda a chamada de ${fmtData(dataSel)}?`, { botao: 'Apagar', perigo: true }))) return;
    try { await api('DELETE', `/encontros/${encontro.id}`); aviso('Chamada apagada.'); await desenhar(conteudo); } catch (err) { avisoErro(err); }
  });

  $('#salvar').onclick = (e) => ocupado(e.currentTarget, async () => {
    if (!marca.size) return aviso('Marque pelo menos uma pessoa.', 'erro');
    try {
      const r = await api('POST', '/presenca', {
        data: dataSel, tema: $('#tema').value,
        registros: [...marca].map(([pessoa_id, presente]) => ({ pessoa_id, presente, justificativa: just.get(pessoa_id) })),
      });
      conteudo.dataset.alterado = '0';
      const p = [...marca.values()].filter(Boolean).length;
      aviso(`Chamada salva: ${p} presentes, ${marca.size - p} ausentes.`);
      atualizarContadores();
      if (r.alertas.length) {
        janela({
          titulo: 'Para a Pastoral',
          corpo: `<p style="margin-bottom:10px">${r.alertas.length === 1 ? 'Esta pessoa está' : 'Estas pessoas estão'} com faltas seguidas e ainda sem acompanhamento:</p>
            <div class="lista">${r.alertas.slice(0, 8).map((a) => `<div><div class="cresce">${esc(a.pessoa.nome)}<span>${a.faltas} faltas seguidas</span></div></div>`).join('')}</div>
            <div class="janela-acoes"><button class="btn" data-fechar>Fechar</button><button class="btn primary" id="ir">Abrir Pastoral</button></div>`,
          aoAbrir: (j, fechar) => { j.querySelector('#ir').onclick = () => { fechar(); navegar('/pastoral'); }; },
        });
      }
    } catch (err) { avisoErro(err); }
  });
}
