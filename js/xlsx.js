// Gera arquivos Excel (.xlsx) direto no navegador, sem bibliotecas externas
// © Arthur Ramon da Silva — Todos os direitos reservados.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (dados) => { let c = 0xffffffff; for (let i = 0; i < dados.length; i++) c = CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// ZIP sem compressão (método "stored"): simples e aceito pelo Excel, Google Planilhas e LibreOffice
function zip(arquivos) {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let pos = 0;
  for (const [nome, conteudo] of arquivos) {
    const n = enc.encode(nome), d = enc.encode(conteudo), crc = crc32(d);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint32(14, crc, true); local.setUint32(18, d.length, true); local.setUint32(22, d.length, true); local.setUint16(26, n.length, true);
    partes.push(new Uint8Array(local.buffer), n, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true); c.setUint32(42, pos, true);
    central.push(new Uint8Array(c.buffer), n);
    pos += 30 + n.length + d.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true);
  return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const letra = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const ehData = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const serial = (iso) => { const [a, m, d] = iso.split('-').map(Number); return (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };

function folha(linhas, comDesenho = false, semFiltro = false) {
  const larg = linhas[0].map((_, c) => Math.min(60, Math.max(8, ...linhas.map((l) => String(l[c] ?? '').length + 2))));
  const cols = `<cols>${larg.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  const rows = linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => {
    const ref = `${letra(c)}${r + 1}`;
    if (v === null || v === undefined || v === '') return '';
    if (r === 0) return `<c r="${ref}" t="inlineStr" s="1"><is><t>${xmlEsc(v)}</t></is></c>`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    if (ehData(v)) return `<c r="${ref}" s="2"><v>${serial(v)}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData>${linhas.length > 1 && !semFiltro ? `<autoFilter ref="A1:${letra(linhas[0].length - 1)}${linhas.length}"/>` : ''}${comDesenho ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
}


// ---------- Gráfico de verdade dentro da planilha (o Excel/Planilhas Google desenham e dá para editar) ----------
// aba.grafico = { titulo, tipo: 'barra' | 'linha', empilhado, categoria: col, series: [col, ...], cores: ['7B2FF7', ...] }
// Os dados vêm da própria aba (linha 1 = títulos).
const CORES_GRAFICO = ['7B2FF7', '19B8D4', 'E8336D', 'E0A020', '1F8A57'];
function graficoXML(nomeAba, linhas, g) {
  const ref = (c, r1, r2) => `'${nomeAba.replace(/'/g, "''")}'!$${letra(c)}$${r1}${r2 ? `:$${letra(c)}$${r2}` : ''}`;
  const n = linhas.length - 1;
  const cats = linhas.slice(1).map((l) => String(l[g.categoria] ?? ''));
  const catXML = `<c:cat><c:strRef><c:f>${ref(g.categoria, 2, n + 1)}</c:f><c:strCache><c:ptCount val="${n}"/>${cats.map((t, i) => `<c:pt idx="${i}"><c:v>${xmlEsc(t)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`;
  const ser = g.series.map((col, k) => {
    const cor = (g.cores || CORES_GRAFICO)[k % CORES_GRAFICO.length];
    const vals = linhas.slice(1).map((l) => (typeof l[col] === 'number' ? l[col] : null));
    const visual = g.tipo === 'linha'
      ? `<c:spPr><a:ln w="28575"><a:solidFill><a:srgbClr val="${cor}"/></a:solidFill></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="${cor}"/></a:solidFill></c:spPr></c:marker>`
      : `<c:spPr><a:solidFill><a:srgbClr val="${cor}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>`;
    return `<c:ser><c:idx val="${k}"/><c:order val="${k}"/><c:tx><c:strRef><c:f>${ref(col, 1)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEsc(linhas[0][col])}</c:v></c:pt></c:strCache></c:strRef></c:tx>${visual}
      ${catXML}<c:val><c:numRef><c:f>${ref(col, 2, n + 1)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${vals.map((v, i) => (v === null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)).join('')}</c:numCache></c:numRef></c:val>${g.tipo === 'linha' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
  }).join('');
  const rotulos = g.rotulos ? '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>' : '';
  const corpo = g.tipo === 'linha'
    ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}${rotulos}<c:marker val="1"/><c:axId val="1"/><c:axId val="2"/></c:lineChart>`
    : `<c:barChart><c:barDir val="col"/><c:grouping val="${g.empilhado ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${ser}${rotulos}<c:gapWidth val="60"/>${g.empilhado ? '<c:overlap val="100"/>' : ''}<c:axId val="1"/><c:axId val="2"/></c:barChart>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/>
<c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="pt-BR" sz="1400" b="1"/><a:t>${xmlEsc(g.titulo || '')}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>${corpo}
<c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="2"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
<c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="E5E3DC"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="1"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>
</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}
// Onde o gráfico fica: à direita da tabela, do tamanho de uma tela
const desenhoXML = (colInicio) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
<xdr:twoCellAnchor><xdr:from><xdr:col>${colInicio}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${colInicio + 10}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>22</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Gráfico"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
const RELS = (alvo, tipo) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${tipo}" Target="${alvo}"/></Relationships>`;

// abas: [{ nome: 'Pessoas', linhas: [[títulos...], [valores...], ...], grafico? }]
// Datas no formato AAAA-MM-DD viram datas de verdade no Excel.
export function gerarXLSX(abas) {
  const nomeAba = (a) => a.nome.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
  const comGrafico = abas.map((a, i) => (a.grafico && a.linhas.length > 1 ? i : -1)).filter((i) => i >= 0);
  const extras = [];
  comGrafico.forEach((i, k) => {
    const a = abas[i], n = k + 1;
    extras.push([`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, RELS(`../drawings/drawing${n}.xml`, 'drawing')]);
    extras.push([`xl/drawings/drawing${n}.xml`, desenhoXML(a.linhas[0].length + 1)]);
    extras.push([`xl/drawings/_rels/drawing${n}.xml.rels`, RELS(`../charts/chart${n}.xml`, 'chart')]);
    extras.push([`xl/charts/chart${n}.xml`, graficoXML(nomeAba(a), a.linhas, a.grafico)]);
  });
  const tiposExtras = comGrafico.map((_, k) => `<Override PartName="/xl/drawings/drawing${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('');
  const arquivos = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}${tiposExtras}</Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${abas.map((a, i) => `<sheet name="${xmlEsc(nomeAba(a))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF18171B"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ...abas.map((a, i) => [`xl/worksheets/sheet${i + 1}.xml`, folha(a.linhas, comGrafico.includes(i), a.semFiltro)]),
    ...extras,
  ];
  return zip(arquivos);
}

export function baixarXLSX(nomeArquivo, abas) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(gerarXLSX(abas));
  a.download = nomeArquivo.endsWith('.xlsx') ? nomeArquivo : `${nomeArquivo}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
