// Início (visão geral) — cada bloco só aparece para quem tem permissão
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { api, urlFoto, sessao, pode } from '../api.js';
import { esc, foto, fmtData, fmtDiaMes, parseISO, pct, TIPOS, idade } from '../ui.js';
import { barras, tabelaDados, COR } from '../charts.js';

export async function render(conteudo) {
  const hoje = new Date(), mes = hoje.getMonth();
  const cabecalho = `<div class="cabecalho"><div><h1>Início</h1><p class="sub">${hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>`;

  if (!sessao.usuario.permissoes.length) {
    conteudo.innerHTML = `${cabecalho}<div class="painel vazio">Sua conta está liberada, mas você ainda não faz parte de nenhum grupo.<br>Peça a um administrador para incluir você no grupo certo.</div>`;
    return;
  }

  const { pessoas, encontros: recentes, casosAbertos, alertas } = await api('GET', '/painel');
  const enc = (recentes || []).slice().reverse().map((e) => ({ ...e, outros: e.total - e.membros }));
  const ult = enc[enc.length - 1], ant = enc[enc.length - 2];
  const ult4 = enc.slice(-4);
  const media4 = ult4.length ? Math.round(ult4.reduce((s, e) => s + e.total, 0) / ult4.length) : null;
  const nomeMes = hoje.toLocaleDateString('pt-BR', { month: 'long' });
  const linkPessoa = (id, html) => (pode('pessoas.ver') ? `<a href="#/pessoas/${id}">${html}</a>` : `<div>${html}</div>`);

  const numeros = [];
  if (pessoas) {
    const novosMes = pessoas.filter((p) => { const d = parseISO(p.data_cadastro); return d.getMonth() === mes && d.getFullYear() === hoje.getFullYear(); }).length;
    numeros.push(['Pessoas ativas', pessoas.length, novosMes ? `${novosMes} ${novosMes === 1 ? 'cadastrada' : 'cadastradas'} em ${nomeMes}` : `${pessoas.filter((p) => p.tipo === 'membro').length} membros`]);
  }
  if (recentes) {
    let comp = 'presentes';
    if (ult && ant) { const d = ult.total - ant.total; comp = d === 0 ? 'igual à semana anterior' : `<span class="${d > 0 ? 'sobe' : 'desce'}">${d > 0 ? '+' : ''}${d}</span> em relação à anterior`; }
    numeros.push([`Último encontro${ult ? ` (${fmtDiaMes(ult.data)})` : ''}`, ult ? ult.total : '—', ult ? comp : 'nenhum registrado ainda']);
    numeros.push(['Média das últimas 4 sextas', media4 ?? '—', 'presentes por encontro']);
  }
  if (alertas) numeros.push(['Pastoral', casosAbertos, alertas.length ? `<span class="desce">${alertas.length} sem acompanhamento</span>` : 'acompanhamentos em aberto']);

  const blocoGrafico = recentes ? `<section class="painel">
      <div class="painel-topo"><h2>Presentes por encontro</h2><span class="sub">últimas ${enc.length || 12} sextas</span></div>
      <div class="painel-corpo">
        ${enc.length ? `<div class="grafico"><canvas id="g-presenca" role="img" aria-label="Presentes por encontro"></canvas></div>
          ${tabelaDados(enc.map((e) => fmtData(e.data)), [{ rotulo: 'Membros', dados: enc.map((e) => e.membros) }, { rotulo: 'Visitantes e frequentadores', dados: enc.map((e) => e.outros) }, { rotulo: 'Total', dados: enc.map((e) => e.total) }])}`
        : '<p class="muted">O gráfico aparece depois da primeira chamada salva.</p>'}
      </div></section>` : '';

  const blocoFaltando = alertas ? `<section class="painel">
      <div class="painel-topo"><h2>Faltando</h2><span class="sub">2+ faltas seguidas, sem responsável</span></div>
      <div class="painel-corpo">
        ${alertas.length ? `<div class="lista">${alertas.slice(0, 6).map((a) => linkPessoa(a.pessoa.id, `${foto(a.pessoa.nome, urlFoto(a.pessoa.id, a.pessoa.foto_v))}
            <div class="cresce">${esc(a.pessoa.nome)}<span>${a.faltas} faltas${a.ultimaPresenca ? ` · veio por último em ${fmtData(a.ultimaPresenca)}` : ''}</span></div>`)).join('')}</div>
          ${alertas.length > 6 ? `<p class="small" style="margin-top:8px"><a href="#/pastoral">Mais ${alertas.length - 6} na Pastoral</a></p>` : ''}`
        : '<p class="muted">Ninguém nessa situação agora.</p>'}
      </div></section>` : '';

  let blocosPessoas = '';
  if (pessoas) {
    const aniversariantes = pessoas.filter((p) => p.data_nascimento && parseISO(p.data_nascimento).getMonth() === mes)
      .sort((a, b) => parseISO(a.data_nascimento).getDate() - parseISO(b.data_nascimento).getDate());
    const idades = pessoas.map((p) => idade(p.data_nascimento)).filter((x) => x !== null);
    blocosPessoas = `<div class="colunas c2 mt">
      <section class="painel">
        <div class="painel-topo"><h2>Composição do grupo</h2><span class="sub">pessoas ativas</span></div>
        <div class="painel-corpo"><table class="tabela"><tbody>
          ${Object.entries(TIPOS).map(([t, nome]) => { const n = pessoas.filter((p) => p.tipo === t).length; return `<tr><td>${nome}s</td><td class="dir num">${n}</td><td class="dir num muted">${pct(n, pessoas.length)}%</td></tr>`; }).join('')}
          ${idades.length ? `<tr><td>Idade média</td><td class="dir num">${Math.round(idades.reduce((a, b) => a + b, 0) / idades.length)} anos</td><td></td></tr>` : ''}
        </tbody></table></div>
      </section>
      <section class="painel">
        <div class="painel-topo"><h2>Aniversários em ${nomeMes}</h2></div>
        <div class="painel-corpo">
          ${aniversariantes.length ? `<div class="lista">${aniversariantes.map((p) => {
            const d = parseISO(p.data_nascimento); const eHoje = d.getDate() === hoje.getDate();
            return linkPessoa(p.id, `${foto(p.nome, urlFoto(p.id, p.foto_v))}<div class="cresce">${esc(p.nome)}<span>${(idade(p.data_nascimento) ?? 0) + (d.getDate() > hoje.getDate() ? 1 : 0)} anos</span></div>
              <span class="${eHoje ? 'tag ok' : 'muted small'}">${eHoje ? 'hoje' : fmtDiaMes(p.data_nascimento)}</span>`);
          }).join('')}</div>` : '<p class="muted">Nenhum aniversário este mês.</p>'}
        </div>
      </section></div>`;
  }

  const meio = [blocoGrafico, blocoFaltando].filter(Boolean);
  conteudo.innerHTML = `${cabecalho}
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
