// Dashboard (tela inicial)
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { sb, ok, store, urlsFotos } from '../supabase.js';
import { icon, esc, avatar, fmtDataCurta, fmtData, parseISO, pct, TIPOS, idade } from '../ui.js';
import { barras, tabelaAlt, COR } from '../charts.js';
import { calcularAlertas } from './pastoral.js';

export async function render(content) {
  const [pessoas, encontros, casosAbertos, alertas] = await Promise.all([
    ok(await sb.from('pessoas').select('id,nome,tipo,data_nascimento,foto_path,data_cadastro').eq('cd_status', 1)),
    ok(await sb.from('encontros').select('id,data,tema').order('data', { ascending: false }).limit(12)),
    sb.from('pastoral_casos').select('id', { count: 'exact', head: true }).neq('status', 'concluido'),
    calcularAlertas(),
  ]);
  const ids = encontros.map((e) => e.id);
  const pres = ids.length ? ok(await sb.from('presencas').select('encontro_id,presente,pessoas(tipo)').in('encontro_id', ids).eq('presente', true)) : [];

  // Presença por encontro (cronológico)
  const enc = encontros.slice().reverse().map((e) => {
    const r = pres.filter((p) => p.encontro_id === e.id);
    const membros = r.filter((p) => p.pessoas?.tipo === 'membro').length;
    return { ...e, total: r.length, membros, outros: r.length - membros };
  });
  const ult = enc[enc.length - 1], pen = enc[enc.length - 2];
  const delta = ult && pen ? ult.total - pen.total : null;
  const ultimos4 = enc.slice(-4);
  const media4 = ultimos4.length ? Math.round(ultimos4.reduce((s, e) => s + e.total, 0) / ultimos4.length) : 0;

  const porTipo = Object.keys(TIPOS).map((t) => ({ t, n: pessoas.filter((p) => p.tipo === t).length }));
  const hoje = new Date();
  const mes = hoje.getMonth();
  const aniversariantes = pessoas.filter((p) => p.data_nascimento && parseISO(p.data_nascimento).getMonth() === mes)
    .sort((a, b) => parseISO(a.data_nascimento).getDate() - parseISO(b.data_nascimento).getDate());
  const novosMes = pessoas.filter((p) => { const d = parseISO(p.data_cadastro); return d.getMonth() === mes && d.getFullYear() === hoje.getFullYear(); }).length;
  const fotos = await urlsFotos([...aniversariantes, ...alertas.map((a) => a.pessoa)].map((p) => p.foto_path));

  const hora = hoje.getHours();
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const nomeMes = hoje.toLocaleDateString('pt-BR', { month: 'long' });

  const stat = (ic, label, valor, foot) => `<div class="card stat"><div class="label"><span class="ic">${icon(ic)}</span>${label}</div><div class="value">${valor}</div><div class="foot">${foot}</div></div>`;

  content.innerHTML = `
    <div class="page-head">
      <div><h1>${saud}, ${esc(store.profile.nome.split(' ')[0])}!</h1><p>Visão geral do Hype hoje, ${hoje.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}.</p></div>
      <div class="actions"><a class="btn btn-ghost" href="#/pessoas/nova">${icon('userPlus')} Nova pessoa</a><a class="btn btn-primary" href="#/presenca">${icon('checkSquare')} Marcar presença</a></div>
    </div>

    <div class="grid grid-4">
      ${stat('users', 'Pessoas ativas', pessoas.length, `${novosMes ? `<span class="delta up">+${novosMes}</span> novos em ${nomeMes}` : `cadastros com status ativo`}`)}
      ${stat('checkSquare', 'Último encontro', ult ? ult.total : '—', ult ? `${fmtData(ult.data)}${delta === 0 ? ' · igual ao anterior' : delta !== null ? ` · <span class="delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}</span> vs anterior` : ''}` : 'nenhum encontro registrado')}
      ${stat('chart', 'Média recente', ultimos4.length ? media4 : '—', ultimos4.length ? `presentes nos últimos ${ultimos4.length} encontros` : 'sem dados ainda')}
      ${stat('heart', 'Pastoral', casosAbertos.count || 0, alertas.length ? `<span class="delta down">${alertas.length} em alerta</span> sem responsável` : 'acompanhamentos em aberto')}
    </div>

    <div class="grid grid-2-1 mt">
      <div class="card">
        <div class="card-head"><div><h2>Presença nos encontros</h2><p>Presentes por sexta — últimos ${enc.length || 12} encontros</p></div><a class="small" href="#/relatorios">Relatórios →</a></div>
        ${enc.length ? `<div class="chart-box"><canvas id="ch-pres" aria-label="Gráfico de presença por encontro" role="img"></canvas></div>
          ${tabelaAlt(enc.map((e) => fmtData(e.data)), [{ label: 'Membros', data: enc.map((e) => e.membros) }, { label: 'Visitantes/frequentadores', data: enc.map((e) => e.outros) }, { label: 'Total', data: enc.map((e) => e.total) }])}`
          : `<div class="empty">${icon('bars')}<p>Assim que a primeira presença for marcada, o gráfico aparece aqui.</p><a class="btn btn-primary" href="#/presenca">Marcar presença</a></div>`}
      </div>
      <div class="card">
        <div class="card-head"><div><h2>Perfil do grupo</h2><p>Pessoas ativas por tipo</p></div></div>
        <div class="grid" style="gap:14px">
          ${porTipo.map(({ t, n }) => `<div>
            <div style="display:flex;justify-content:space-between;font-size:.9rem;margin-bottom:6px"><span>${TIPOS[t]}s</span><b>${n} <span class="muted" style="font-weight:500">· ${pct(n, pessoas.length)}%</span></b></div>
            <div style="height:8px;background:var(--surface-2);border-radius:9px;overflow:hidden"><div style="height:100%;width:${pct(n, pessoas.length)}%;background:${COR.s1};border-radius:9px"></div></div></div>`).join('')}
          ${(() => {
            const comIdade = pessoas.map((p) => idade(p.data_nascimento)).filter((x) => x !== null);
            return comIdade.length ? `<p class="muted small" style="margin:4px 0 0">Idade média: <b>${Math.round(comIdade.reduce((a, b) => a + b, 0) / comIdade.length)} anos</b></p>` : '';
          })()}
        </div>
      </div>
    </div>

    <div class="grid grid-2 mt">
      <div class="card">
        <div class="card-head"><div><h2>${icon('alert')} Atenção da Pastoral</h2><p>Faltas seguidas, sem acompanhamento</p></div><a class="small" href="#/pastoral">Ver tudo →</a></div>
        ${alertas.length ? `<div class="list">${alertas.slice(0, 5).map((a) => `<a class="list-item" href="#/pessoas/${a.pessoa.id}" style="color:inherit;text-decoration:none">${avatar(a.pessoa.nome, fotos[a.pessoa.foto_path], 'sm')}
            <div class="grow"><b>${esc(a.pessoa.nome)}</b><span>${a.faltas} faltas seguidas</span></div><span class="badge warn">${a.faltas}F</span></a>`).join('')}</div>`
          : `<p class="muted small" style="margin:0">Ninguém em alerta. 🙌</p>`}
      </div>
      <div class="card">
        <div class="card-head"><div><h2>${icon('cake')} Aniversariantes de ${nomeMes}</h2><p>${aniversariantes.length} ${aniversariantes.length === 1 ? 'pessoa' : 'pessoas'}</p></div></div>
        ${aniversariantes.length ? `<div class="list">${aniversariantes.slice(0, 8).map((p) => {
          const d = parseISO(p.data_nascimento); const hojeEh = d.getDate() === hoje.getDate();
          return `<a class="list-item" href="#/pessoas/${p.id}" style="color:inherit;text-decoration:none">${avatar(p.nome, fotos[p.foto_path], 'sm')}
            <div class="grow"><b>${esc(p.nome)}</b><span>Faz ${(idade(p.data_nascimento) ?? 0) + (d.getDate() > hoje.getDate() ? 1 : 0)} anos</span></div>
            <span class="badge ${hojeEh ? 'ok' : ''}">${hojeEh ? '🎉 Hoje' : fmtDataCurta(p.data_nascimento)}</span></a>`;
        }).join('')}</div>` : '<p class="muted small" style="margin:0">Nenhum aniversariante neste mês.</p>'}
      </div>
    </div>`;

  let chart;
  if (enc.length) {
    chart = barras(document.getElementById('ch-pres'), {
      labels: enc.map((e) => fmtDataCurta(e.data)),
      empilhado: true,
      series: [
        { label: 'Membros', data: enc.map((e) => e.membros), cor: COR.s1 },
        { label: 'Visitantes/frequentadores', data: enc.map((e) => e.outros), cor: COR.s2 },
      ],
    });
  }
  return () => chart?.destroy();
}
