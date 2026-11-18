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
    ${botao ? `<p style="margin:22px 0"><a href="${esc(link)}" style="background:#1d5c4f;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:6px;display:inline-block">${esc(botao)}</a></p>
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

module.exports = { emailRedefinirSenha, emailNovoCadastro };
