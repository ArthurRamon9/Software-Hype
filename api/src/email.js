// Envio de e-mails (Gmail SMTP com senha de app — gratuito)
// © Arthur Ramon da Silva — Todos os direitos reservados.
const nodemailer = require('nodemailer');

let transporte = null;
function getTransporte() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (!transporte) {
    const porta = Number(process.env.SMTP_PORT || 465);
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: porta,
      secure: porta === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      pool: true, maxConnections: 4,   // vários convites de uma vez sem abrir uma conexão por e-mail
    });
  }
  return transporte;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout({ titulo, paragrafos, botao, link, rodape }) {
  return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f4f3ef;font-family:Segoe UI,Arial,sans-serif;color:#1c1b19">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:480px;background:#fff;border:1px solid #e3e1da;border-radius:8px" cellspacing="0" cellpadding="0"><tr><td style="padding:28px">
    <div style="font-size:15px;font-weight:700;margin-bottom:22px">Gestão do Hype</div>
    <div style="font-size:20px;font-weight:700;margin-bottom:12px">${esc(titulo)}</div>
    ${paragrafos.map((p) => `<p style="font-size:15px;line-height:1.55;color:#4a4842;margin:0 0 14px">${p}</p>`).join('')}
    ${botao ? `<p style="margin:22px 0"><a href="${esc(link)}" style="background:#7b2ff7;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:6px;display:inline-block">${esc(botao)}</a></p>
    <p style="font-size:12px;color:#8a877d;margin:0 0 14px;word-break:break-all">Se o botão não funcionar, copie este endereço no navegador:<br>${esc(link)}</p>` : ''}
    ${rodape ? `<p style="font-size:13px;color:#8a877d;margin:0">${rodape}</p>` : ''}
  </td></tr></table>
  <p style="font-size:12px;color:#8a877d;margin:16px 0 0">© Gestão do Hype · Todos os direitos reservados a Arthur Ramon da Silva.</p>
  </td></tr></table></body></html>`;
}

async function enviar(para, assunto, html) {
  const t = getTransporte();
  if (!t) {
    console.warn(`[email] SMTP não configurado. Para: ${para} | ${assunto}`);
    // No teste local (sem Gmail configurado) os links do e-mail aparecem aqui no terminal
    if (process.env.MODO_LOCAL === '1') {
      const links = [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')))];
      if (links.length) console.warn(`[email] Link do e-mail: ${links.join('  ')}`);
    }
    return false;
  }
  await t.sendMail({ from: `"Gestão do Hype" <${process.env.SMTP_USER}>`, to: para, subject: assunto, html });
  return true;
}

function emailRedefinirSenha(para, nome, link) {
  return enviar(para, 'Redefinir sua senha — Gestão do Hype', layout({
    titulo: 'Redefinir senha',
    paragrafos: [`Olá, ${esc(nome.split(' ')[0])}.`, 'Recebemos um pedido para trocar a senha da sua conta. Use o botão abaixo para escolher uma nova senha. O link vale por 1 hora.'],
    botao: 'Escolher nova senha', link,
    rodape: 'Se não foi você, ignore este e-mail. Sua senha atual continua valendo.',
  }));
}

function emailNovoCadastro(para, nomeNovo, emailNovo, link) {
  return enviar(para, `Pedido de acesso: ${nomeNovo}`, layout({
    titulo: 'Novo pedido de acesso',
    paragrafos: [`<b>${esc(nomeNovo)}</b> (${esc(emailNovo)}) criou uma conta e está aguardando liberação.`],
    botao: 'Ver pedidos', link,
  }));
}

// ---------- Convite de agenda (.ics): aparece no Google Agenda / iPhone / Outlook com Sim, Não, Talvez ----------
const icsTexto = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsData = (d) => d.replace(/[-:]/g, '').slice(0, 15);   // 2026-11-28T09:00:00 -> 20261128T090000 (horário de Brasília)
const dobrar = (linha) => { const out = []; let l = linha; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); };
function montarIcs({ uid, sequencia, inicio, fim, titulo, local, descricao, para, nomePara, cancelar }) {
  const org = process.env.SMTP_USER || 'gestao@hype.local';
  const agora = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  return ['BEGIN:VCALENDAR', 'PRODID:-//Gestao do Hype//PT-BR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', `METHOD:${cancelar ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VTIMEZONE', 'TZID:America/Sao_Paulo', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:-0300', 'TZOFFSETTO:-0300', 'TZNAME:-03', 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT', `UID:${uid}`, `SEQUENCE:${sequencia}`, `DTSTAMP:${agora}`,
    `DTSTART;TZID=America/Sao_Paulo:${icsData(inicio)}`, `DTEND;TZID=America/Sao_Paulo:${icsData(fim)}`,
    `SUMMARY:${icsTexto(titulo)}`, local ? `LOCATION:${icsTexto(local)}` : null, descricao ? `DESCRIPTION:${icsTexto(descricao)}` : null,
    `ORGANIZER;CN=Gestão do Hype:mailto:${org}`,
    `ATTENDEE;CN=${icsTexto(nomePara)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${para}`,
    `STATUS:${cancelar ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT', 'END:VCALENDAR']
    .filter(Boolean).map(dobrar).join('\r\n');
}
// Um e-mail por pessoa (ninguém vê o e-mail dos outros). Devolve quantos foram enviados.
async function emailConvites(reuniao, convidados, { cancelar = false } = {}) {
  const t = getTransporte();
  const quando = new Date(reuniao.inicio + '-03:00').toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const assunto = `${cancelar ? 'Cancelada: ' : ''}${reuniao.titulo} — ${reuniao.ministerio}`;
  if (!t) { console.warn(`[email] SMTP não configurado. Convite "${assunto}" para: ${convidados.map((c) => c.email).join(', ')}`); return 0; }
  const resultados = await Promise.allSettled(convidados.map((c) => t.sendMail({
    from: `"Gestão do Hype" <${process.env.SMTP_USER}>`, to: c.email, subject: assunto,
    html: layout({
      titulo: cancelar ? 'Reunião cancelada' : `Reunião: ${esc(reuniao.ministerio)}`,
      paragrafos: [`Olá, ${esc(c.nome.split(' ')[0])}.`,
        cancelar ? `A reunião <b>${esc(reuniao.titulo)}</b> de ${esc(quando)} foi cancelada.`
          : `Você foi convidado(a) para <b>${esc(reuniao.titulo)}</b>, ${esc(quando)}${reuniao.local ? `, em ${esc(reuniao.local)}` : ''}.`,
        reuniao.descricao && !cancelar ? esc(reuniao.descricao) : null].filter(Boolean),
      rodape: cancelar ? null : 'O convite já vai para a sua agenda. Use Sim, Não ou Talvez para responder.',
    }),
    icalEvent: { method: cancelar ? 'CANCEL' : 'REQUEST', content: montarIcs({ ...reuniao, para: c.email, nomePara: c.nome, cancelar }) },
  })));
  resultados.filter((r) => r.status === 'rejected').forEach((r) => console.error('[email] convite', r.reason?.message));
  return resultados.filter((r) => r.status === 'fulfilled').length;
}

// Quem acompanha alguém (Pastoral ou Integração) fica sabendo quando a pessoa veio ao Hype
function emailVeioAoHype(para, nomeResp, pessoas, dataBR, link) {
  const nomes = pessoas.map((p) => `<b>${esc(p.nome)}</b>${p.area === 'integracao' ? ' (Integração)' : ''}`);
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
  return enviar(para, `${pessoas.length === 1 ? pessoas[0].nome : `${pessoas.length} pessoas que você acompanha`} veio ao Hype`, layout({
    titulo: pessoas.length === 1 ? 'Veio ao Hype' : 'Vieram ao Hype',
    paragrafos: [`Olá, ${esc(nomeResp.split(' ')[0])}.`,
      `${lista} ${pessoas.length === 1 ? 'esteve' : 'estiveram'} no Hype na sexta ${esc(dataBR)}. ${pessoas.length === 1 ? 'Você acompanha essa pessoa' : 'Você acompanha essas pessoas'}: é uma boa hora para conversar e registrar como foi.`],
    botao: 'Abrir no site', link,
  }));
}

module.exports = { emailRedefinirSenha, emailNovoCadastro, emailConvites, emailVeioAoHype };
