// Início — cada bloco só aparece para quem tem permissão
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, urlFoto, sessao, pode } from '../api.js';
import { esc, foto, fmtData, fmtDiaMes, parseISO, isoLocal, pct, TIPOS, idade, saudacao } from '../ui.js';
import { barras, tabelaDados, COR } from '../charts.js';

const DIA = 86400000;

// Próxima sexta (hoje, se hoje for sexta)
function proximaSexta() {
  const h = new Date(); const d = new Date(h.getFullYear(), h.getMonth(), h.getDate());
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  return d;
}

export async function render(conteudo) {
  const hoje = new Date(), mes = hoje.getMonth();
  const primeiroNome = esc(sessao.usuario.nome.split(' ')[0]);
  const ola = `<div class="ola"><h1>${saudacao()}, ${primeiroNome}</h1>
    <p>${hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>`;

  if (!sessao.usuario.permissoes.length) {
    conteudo.innerHTML = `${ola}<div class="painel vazio"><b>Quase lá</b>Sua conta está liberada, mas você ainda não faz parte de nenhum grupo.<br>Peça a um administrador para incluir você no grupo certo.</div>`;
    return;
  }

  const { pessoas, encontros: recentes, casosAbertos, alertas } = await api('GET', '/painel');
  const enc = (recentes || []).slice().reverse().map((e) => ({ ...e, outros: e.total - e.membros }));
  const ult = enc[enc.length - 1], ant = enc[enc.length - 2];
  const ult4 = enc.slice(-4);
  const media4 = ult4.length ? Math.round(ult4.reduce((s, e) => s + e.total, 0) / ult4.length) : null;
  const nomeMes = hoje.toLocaleDateString('pt-BR', { month: 'long' });
  const link = (id, html, classe = '') => (pode('pessoas.ver') ? `<a class="${classe}" href="#/pessoas/${id}">${html}</a>` : `<div class="${classe}">${html}</div>`);

  // ---- Destaque: próxima sexta / hoje tem Hype
  const sexta = proximaSexta();
  const ehHoje = isoLocal(sexta) === isoLocal(hoje);
  const faltam = Math.round((sexta - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / DIA);
  const chamadaHoje = ehHoje && ult && ult.data === isoLocal(hoje) ? ult : null;
  let destaque = `<section class="destaque"><div>`;
  if (ehHoje) {
    destaque += `<div class="quando">Hoje</div><h2>Hoje tem Hype!</h2>
      <p>${chamadaHoje ? `Chamada salva: <b>${chamadaHoje.total}</b> presentes${chamadaHoje.visitantes ? `, sendo ${chamadaHoje.visitantes} visitante${chamadaHoje.visitantes > 1 ? 's' : ''}` : ''}.` : 'A chamada de hoje ainda não foi feita.'}</p>`;
  } else {
    destaque += `<div class="quando">Próximo encontro</div>
      <h2>${sexta.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase())}</h2>
      <p style="font-size:16px;color:#fff">${faltam === 1 ? 'É amanhã!' : `Faltam ${faltam} dias.`}</p>`;
  }
  if (ult && !ehHoje && ult.visitantes) {
    destaque += `<p>Na última sexta, ${ult.visitantes} visitante${ult.visitantes > 1 ? 's vieram' : ' veio'}. Que tal mandar uma mensagem para ${ult.visitantes > 1 ? 'eles' : 'ele'}?</p>`;
  }
  destaque += '</div>';
  if (ehHoje && pode('presenca.marcar')) destaque += `<a class="btn primary" href="#/presenca">${chamadaHoje ? 'Ver chamada' : 'Fazer a chamada'}</a>`;
  destaque += '</section>';

  // ---- Números
  const numeros = [];
  if (pessoas) {
    const novosMes = pessoas.filter((p) => { const d = parseISO(p.data_cadastro); return d.getMonth() === mes && d.getFullYear() === hoje.getFullYear(); }).length;
    numeros.push(['Pessoas ativas', pessoas.length, novosMes ? `+${novosMes} em ${nomeMes}` : `${pessoas.filter((p) => p.tipo === 'membro').length} membros`]);
  }
  if (recentes) {
    let comp = 'presentes';
    if (ult && ant) { const d = ult.total - ant.total; comp = d === 0 ? 'igual à semana anterior' : `<span class="${d > 0 ? 'sobe' : 'desce'}">${d > 0 ? '+' : ''}${d}</span> sobre a anterior`; }
    numeros.push([`Última sexta${ult ? ` · ${fmtDiaMes(ult.data)}` : ''}`, ult ? ult.total : '—', ult ? comp : 'nenhuma chamada ainda']);
    numeros.push(['Média das últimas 4', media4 ?? '—', 'presentes por sexta']);
  }
  if (alertas) numeros.push(['Pastoral', casosAbertos, alertas.length ? `<span class="desce">${alertas.length} sem acompanhamento</span>` : 'acompanhamentos em aberto']);

  // ---- Gráfico e faltando
  const blocoGrafico = recentes ? `<section class="painel">
      <div class="painel-topo"><h2>Presentes por sexta</h2><span class="sub">últimos ${enc.length || 12} encontros</span></div>
      <div class="painel-corpo">
        ${enc.length ? `<div class="grafico"><canvas id="g-presenca" role="img" aria-label="Presentes por encontro"></canvas></div>
          ${tabelaDados(enc.map((e) => fmtData(e.data)), [{ rotulo: 'Membros', dados: enc.map((e) => e.membros) }, { rotulo: 'Visitantes e frequentadores', dados: enc.map((e) => e.outros) }, { rotulo: 'Total', dados: enc.map((e) => e.total) }])}`
        : `<div class="vazio"><b>Nenhuma chamada ainda</b>O gráfico aparece depois da primeira chamada salva.${pode('presenca.marcar') ? '<br><a class="btn" href="#/presenca">Fazer a primeira chamada</a>' : ''}</div>`}
      </div></section>` : '';

  const blocoFaltando = alertas ? `<section class="painel">
      <div class="painel-topo"><h2>Sentindo falta</h2><span class="sub">2+ faltas seguidas</span></div>
      <div class="painel-corpo">
        ${alertas.length ? `<div class="lista">${alertas.slice(0, 6).map((a) => link(a.pessoa.id, `${foto(a.pessoa.nome, urlFoto(a.pessoa.id, a.pessoa.foto_v))}
            <div class="cresce">${esc(a.pessoa.nome)}<span>${a.faltas} faltas${a.ultimaPresenca ? ` · veio em ${fmtData(a.ultimaPresenca)}` : ''}</span></div>`)).join('')}</div>
          <p class="small" style="margin-top:10px"><a href="#/pastoral">${alertas.length > 6 ? `Ver todos os ${alertas.length} na Pastoral` : 'Abrir Pastoral'}</a></p>`
        : '<div class="vazio" style="padding:20px 0"><b>Todo mundo por perto</b>Ninguém com faltas seguidas sem acompanhamento.</div>'}
      </div></section>` : '';

  // ---- Pessoas: aniversários, chegaram há pouco, composição
  let blocosPessoas = '';
  if (pessoas) {
    const aniversariantes = pessoas.filter((p) => p.data_nascimento && parseISO(p.data_nascimento).getMonth() === mes)
      .sort((a, b) => parseISO(a.data_nascimento).getDate() - parseISO(b.data_nascimento).getDate());
    const limite = isoLocal(new Date(Date.now() - 30 * DIA));
    const novos = pessoas.filter((p) => p.tipo === 'visitante' && p.data_cadastro >= limite).sort((a, b) => b.data_cadastro.localeCompare(a.data_cadastro));
    const idades = pessoas.map((p) => idade(p.data_nascimento)).filter((x) => x !== null);
    const coresTipo = { membro: '#2a78d6', visitante: 'var(--accent)', frequentador: '#1f8a57' };

    blocosPessoas = `<div class="colunas c2 mt">
      <section class="painel">
        <div class="painel-topo"><h2>Aniversários de ${nomeMes}</h2><span class="sub">${aniversariantes.length || 'nenhum'}</span></div>
        <div class="painel-corpo">
          ${aniversariantes.length ? `<div class="rostos">${aniversariantes.map((p) => {
            const d = parseISO(p.data_nascimento); const eHoje = d.getDate() === hoje.getDate();
            return link(p.id, `${foto(p.nome, urlFoto(p.id, p.foto_v), 'm')}<b>${esc(p.nome.split(' ')[0])}</b><span>${eHoje ? 'hoje!' : `dia ${d.getDate()}`}</span>`, `rosto${eHoje ? ' hoje' : ''}`);
          }).join('')}</div>` : '<p class="muted">Ninguém faz aniversário este mês.</p>'}
        </div>
      </section>
      <section class="painel">
        <div class="painel-topo"><h2>Chegaram há pouco</h2><span class="sub">visitantes dos últimos 30 dias</span></div>
        <div class="painel-corpo">
          ${novos.length ? `<div class="rostos">${novos.slice(0, 12).map((p) => link(p.id, `${foto(p.nome, urlFoto(p.id, p.foto_v), 'm')}<b>${esc(p.nome.split(' ')[0])}</b><span>${fmtDiaMes(p.data_cadastro)}</span>`, 'rosto')).join('')}</div>`
          : '<p class="muted">Nenhum visitante novo nos últimos 30 dias.</p>'}
        </div>
      </section>
    </div>
    <section class="painel mt">
      <div class="painel-topo"><h2>Quem é o Hype hoje</h2><span class="sub">${pessoas.length} pessoas ativas${idades.length ? ` · idade média ${Math.round(idades.reduce((a, b) => a + b, 0) / idades.length)} anos` : ''}</span></div>
      <div class="painel-corpo"><div class="barras-tipo">
        ${Object.entries(TIPOS).map(([t, nome]) => { const n = pessoas.filter((p) => p.tipo === t).length; return `<div class="linha"><span>${nome}s</span>
          <div class="trilho"><i style="width:${pct(n, pessoas.length)}%;background:${coresTipo[t]}"></i></div><span class="dir num"><b>${n}</b> <span class="muted">${pct(n, pessoas.length)}%</span></span></div>`; }).join('')}
      </div></div>
    </section>`;
  }

  const meio = [blocoGrafico, blocoFaltando].filter(Boolean);
  conteudo.innerHTML = `${ola}${destaque}
    ${numeros.length ? `<div class="numeros n${Math.min(numeros.length, 4)}">${numeros.map(([r, v, d]) => `<div><div class="rot">${r}</div><div class="val">${v}</div><div class="det">${d}</div></div>`).join('')}</div>` : ''}
    ${meio.length ? `<div class="colunas ${meio.length === 2 ? 'c21' : ''} mt">${meio.join('')}</div>` : ''}
    ${blocosPessoas}`;

  let grafico = null;
  if (enc.length && document.getElementById('g-presenca')) {
    grafico = barras(document.getElementById('g-presenca'), {
      rotulos: enc.map((e) => fmtDiaMes(e.data)),
      empilhado: true,
      series: [
        { rotulo: 'Membros', dados: enc.map((e) => e.membros), cor: COR.s1 },
        { rotulo: 'Visitantes e frequentadores', dados: enc.map((e) => e.outros), cor: COR.s2 },
      ],
    });
  }
  return () => grafico?.destroy();
}
