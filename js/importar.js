// Leitura de planilhas (.xlsx e .csv) direto no navegador, sem bibliotecas externas
// © Arthur Ramon da Silva — Todos os direitos reservados.
import { semAcento, isoLocal } from './ui.js';

// ------------------------------------------------------------ XLSX (é um .zip com XMLs dentro)
async function lerZip(buffer) {
  const v = new DataView(buffer);
  let fimDir = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fimDir = i; break; }
  }
  if (fimDir < 0) throw new Error('Arquivo .xlsx inválido.');
  const total = v.getUint16(fimDir + 10, true);
  let p = v.getUint32(fimDir + 16, true);
  const arquivos = {};
  const dec = new TextDecoder();
  for (let n = 0; n < total; n++) {
    const metodo = v.getUint16(p + 10, true);
    const tamComp = v.getUint32(p + 20, true);
    const tNome = v.getUint16(p + 28, true), tExtra = v.getUint16(p + 30, true), tCom = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nome = dec.decode(new Uint8Array(buffer, p + 46, tNome));
    p += 46 + tNome + tExtra + tCom;
    arquivos[nome] = async () => {
      const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const dados = new Uint8Array(buffer, ini, tamComp);
      if (metodo === 0) return dec.decode(dados);
      const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(fluxo).text();
    };
  }
  return arquivos;
}

const colunaParaIndice = (ref) => { let n = 0; for (const c of ref.replace(/\d+/g, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };

async function lerXlsx(buffer) {
  const z = await lerZip(buffer);
  const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
  const textos = [];
  if (z['xl/sharedStrings.xml']) {
    xml(await z['xl/sharedStrings.xml']()).querySelectorAll('si').forEach((si) => {
      textos.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));
    });
  }
  // Primeira aba da pasta de trabalho
  let caminho = 'xl/worksheets/sheet1.xml';
  if (z['xl/workbook.xml'] && z['xl/_rels/workbook.xml.rels']) {
    const wb = xml(await z['xl/workbook.xml']());
    const primeira = wb.getElementsByTagName('sheet')[0];
    const rid = primeira?.getAttribute('r:id') || primeira?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = [...xml(await z['xl/_rels/workbook.xml.rels']()).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid);
    if (rel) caminho = 'xl/' + rel.getAttribute('Target').replace(/^\/?xl\//, '');
  }
  if (!z[caminho]) throw new Error('Não encontrei a primeira aba da planilha.');
  const folha = xml(await z[caminho]());
  const linhas = [];
  for (const row of folha.getElementsByTagName('row')) {
    const linha = [];
    for (const c of row.getElementsByTagName('c')) {
      const i = colunaParaIndice(c.getAttribute('r') || 'A');
      const tipo = c.getAttribute('t');
      let valor = '';
      if (tipo === 's') valor = textos[Number(c.getElementsByTagName('v')[0]?.textContent)] ?? '';
      else if (tipo === 'inlineStr') valor = [...c.getElementsByTagName('t')].map((t) => t.textContent).join('');
      else valor = c.getElementsByTagName('v')[0]?.textContent ?? '';
      linha[i] = valor;
    }
    linhas.push(Array.from(linha, (x) => x ?? ''));
  }
  return linhas;
}

// ------------------------------------------------------------ CSV
function decodificar(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return new TextDecoder('windows-1252').decode(buffer); }   // CSV salvo pelo Excel em português
}
function lerCsv(buffer) {
  const texto = decodificar(buffer).replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/)[0] || '';
  const sep = [';', ',', '\t'].sort((a, b) => primeira.split(b).length - primeira.split(a).length)[0];
  const linhas = []; let linha = [], campo = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

export async function lerPlanilha(arquivo) {
  const buffer = await arquivo.arrayBuffer();
  const ehXlsx = /\.xlsx$/i.test(arquivo.name) || new Uint8Array(buffer, 0, 2).every((b, i) => b === [0x50, 0x4b][i]);
  if (/\.xls$/i.test(arquivo.name)) throw new Error('Esse é o formato antigo do Excel (.xls). Abra no Excel e salve como .xlsx.');
  const linhas = (ehXlsx ? await lerXlsx(buffer) : lerCsv(buffer)).map((l) => l.map((x) => String(x ?? '').trim()));
  const naoVazias = linhas.filter((l) => l.some(Boolean));
  if (naoVazias.length < 2) throw new Error('A planilha precisa ter uma linha de títulos e pelo menos uma pessoa.');
  // A linha de títulos é a primeira com pelo menos 2 células preenchidas
  const iTitulo = naoVazias.findIndex((l) => l.filter(Boolean).length >= 2);
  const titulos = naoVazias[iTitulo].map((t, i) => t || `Coluna ${i + 1}`);
  return { titulos, linhas: naoVazias.slice(iTitulo + 1) };
}

// ------------------------------------------------------------ Campos do sistema e reconhecimento automático
export const CAMPOS = [
  { campo: 'nome', rotulo: 'Nome *', chaves: ['nome completo', 'nome'] },
  { campo: 'data_nascimento', rotulo: 'Data de nascimento', chaves: ['nascimento', 'nasc', 'aniversario', 'data de nasc', 'dt nasc'] },
  { campo: 'telefone', rotulo: 'Telefone / WhatsApp', chaves: ['whatsapp', 'whats', 'celular', 'telefone', 'fone', 'contato', 'tel'] },
  { campo: 'email', rotulo: 'E-mail', chaves: ['e-mail', 'email'] },
  { campo: 'instagram', rotulo: 'Instagram', chaves: ['instagram', 'insta'] },
  { campo: 'endereco', rotulo: 'Bairro / endereço', chaves: ['bairro', 'endereco', 'rua', 'cidade'] },
  { campo: 'tipo', rotulo: 'Tipo (membro, visitante...)', chaves: ['tipo', 'membro', 'situacao', 'vinculo', 'categoria'] },
  { campo: 'sexo', rotulo: 'Sexo', chaves: ['sexo', 'genero'] },
  { campo: 'batizado', rotulo: 'Batizado', chaves: ['batizado', 'batismo', 'batizada'] },
  { campo: 'ministerios_nomes', rotulo: 'Ministérios', chaves: ['ministerio', 'ministerios', 'serve em', 'area'] },
  { campo: 'como_conheceu', rotulo: 'Como conheceu', chaves: ['como conheceu', 'conheceu', 'convidado por', 'como chegou', 'quem convidou'] },
  { campo: 'data_cadastro', rotulo: 'Data do cadastro', chaves: ['data de cadastro', 'cadastro', 'data de entrada', 'primeira vez', 'entrada'] },
  { campo: 'idade', rotulo: 'Idade (vai para observações)', chaves: ['idade'] },
  { campo: 'observacoes', rotulo: 'Observações', chaves: ['observacoes', 'observacao', 'obs', 'anotacoes'] },
];

export function mapearAutomatico(titulos) {
  const norm = titulos.map((t) => semAcento(t).replace(/[_.:]/g, ' ').replace(/\s+/g, ' ').trim());
  const usados = new Set();
  const mapa = {};
  for (const c of CAMPOS) {
    let achou = -1;
    for (const ch of c.chaves) {
      achou = norm.findIndex((t, i) => !usados.has(i) && (t === ch || t.startsWith(ch + ' ') || t.endsWith(' ' + ch) || (ch.length >= 5 && t.includes(ch))));
      if (achou >= 0) break;
    }
    if (achou >= 0) { mapa[c.campo] = achou; usados.add(achou); }
  }
  return mapa;
}

// ------------------------------------------------------------ Conversão de valores
export function converterData(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {            // número de série do Excel
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return d.getUTCFullYear() > 1900 && d.getUTCFullYear() < 2100 ? d.toISOString().slice(0, 10) : null;
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) { let a = +m[3]; if (a < 100) a += a > (new Date().getFullYear() % 100) ? 1900 : 2000; return valida(a, +m[2], +m[1]); }
  return null;
}
function valida(a, m, d) {
  const dt = new Date(a, m - 1, d);
  return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d && a > 1900 && dt <= new Date() ? isoLocal(dt) : null;
}
const simNao = (v) => /^(s|sim|x|yes|true|1|batizad[oa])$/i.test(semAcento(String(v || '')).trim());
export function converterTipo(v, padrao) {
  const t = semAcento(String(v || ''));
  if (!t) return padrao;
  if (t.includes('frequent')) return 'frequentador';
  if (t.includes('visit') || t === 'nao' || t === 'n') return 'visitante';
  if (t.includes('membro') || simNao(t)) return 'membro';
  return padrao;
}
function converterSexo(v) {
  const t = semAcento(String(v || '')).trim();
  if (/^(m|masc|masculino|homem|h)$/.test(t)) return 'M';
  if (/^(f|fem|feminino|mulher)$/.test(t)) return 'F';
  return null;
}
function limparTelefone(v) {
  const s = String(v || '').trim();
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) return String(Math.round(Number(s)));   // Excel transformou em notação científica
  return s;
}

// Monta a pessoa (como a API espera) a partir de uma linha da planilha
export function montarPessoa(linha, mapa, { tipoPadrao = 'visitante' } = {}) {
  const val = (c) => (mapa[c] >= 0 ? String(linha[mapa[c]] ?? '').trim() : '');
  const obs = [val('observacoes'), val('idade') ? `Idade informada na planilha: ${val('idade')}` : ''].filter(Boolean).join('\n');
  return {
    nome: val('nome').replace(/\s+/g, ' '),
    data_nascimento: converterData(val('data_nascimento')),
    telefone: limparTelefone(val('telefone')),
    email: val('email'),
    instagram: val('instagram'),
    endereco: val('endereco'),
    tipo: converterTipo(val('tipo'), tipoPadrao),
    sexo: converterSexo(val('sexo')),
    batizado: simNao(val('batizado')),
    ministerios_nomes: val('ministerios_nomes'),
    como_conheceu: val('como_conheceu'),
    data_cadastro: converterData(val('data_cadastro')) || isoLocal(new Date()),
    observacoes: obs,
    cd_status: 1,
    _dataOriginal: val('data_nascimento'),
  };
}
