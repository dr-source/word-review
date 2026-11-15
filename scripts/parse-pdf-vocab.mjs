// 零依赖 PDF 单词表解析脚本：从「2025秋八上英语单词表.pdf」提取 { word, phonetic, mean, sentence }。
// 用法：node scripts/parse-pdf-vocab.mjs [pdf路径] [输出路径]
// 不依赖任何第三方库：自己扫 PDF 对象、zlib.inflateSync 解 FlateDecode 内容流、
// 用 ToUnicode CMap 把 CID（中文）映射回 Unicode、按 Tm 坐标还原版式（双栏 + 条目跨行）。
// 调试开关：
//   DEBUG_PARSE=1  打印每页按行归并的原始 run
//   DEBUG_JOIN=1   打印按双栏切分并拼接后的行文本（DEBUG_PAGE 选页、DEBUG_SPLIT 改分割线）
//   DEBUG_RAW=xxx  打印包含 xxx 的那条词目的原始行与解析结果

import fs from 'node:fs';
import zlib from 'node:zlib';

const SRC = process.argv[2] || 'C:/Users/dr515/Desktop/2025秋八上英语单词表.pdf';
const OUT = process.argv[3] || 'src/utils/grade8Words.json';
const DEBUG = process.env.DEBUG_PARSE === '1';

const buf = fs.readFileSync(SRC);
const s = buf.toString('latin1');

function objBody(num) {
  const re = new RegExp('(?:^|[\\r\\n])' + num + '\\s+0\\s+obj');
  const m = re.exec(s);
  if (!m) return null;
  const at = m.index + m[0].length;
  const end = s.indexOf('endobj', at);
  return { at, text: s.slice(at, end) };
}

const streamCache = new Map();
function streamOf(num) {
  if (streamCache.has(num)) return streamCache.get(num);
  let result = null;
  const o = objBody(num);
  if (o) {
    const si = o.text.indexOf('stream');
    if (si < 0) {
      result = { dict: o.text, data: null };
    } else {
      const dict = o.text.slice(0, si);
      let start = o.at + si + 6;
      if (s[start] === '\r') start++;
      if (s[start] === '\n') start++;
      const raw = buf.subarray(start, o.at + o.text.lastIndexOf('endstream'));
      try {
        result = { dict, data: /FlateDecode/.test(dict) ? zlib.inflateSync(raw) : raw };
      } catch {
        result = { dict, data: null };
      }
    }
  }
  streamCache.set(num, result);
  return result;
}

function hexToStr(h) {
  let out = '';
  for (let i = 0; i < h.length; i += 4) out += String.fromCharCode(parseInt(h.slice(i, i + 4).padEnd(4, '0'), 16) || 0);
  return out;
}

const cmapCache = new Map();
function cmapOf(num) {
  if (cmapCache.has(num)) return cmapCache.get(num);
  const map = new Map();
  const st = streamOf(num);
  if (st && st.data) {
    const t = st.data.toString('latin1');
    let m;
    const reBf = /beginbfchar([\s\S]*?)endbfchar/g;
    while ((m = reBf.exec(t))) {
      const pairRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      let p;
      while ((p = pairRe.exec(m[1]))) map.set(parseInt(p[1], 16), hexToStr(p[2]));
    }
    const reBr = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = reBr.exec(t))) {
      const itemRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g;
      let g;
      while ((g = itemRe.exec(m[1]))) {
        const lo = parseInt(g[1], 16);
        const hi = parseInt(g[2], 16);
        if (g[3].startsWith('[')) {
          const arr = g[3].match(/<([0-9A-Fa-f]+)>/g) || [];
          arr.forEach((h, i) => map.set(lo + i, hexToStr(h.slice(1, -1))));
        } else {
          const base = hexToStr(g[3].slice(1, -1));
          const cp = base.codePointAt(0) || 0;
          for (let c = lo; c <= hi; c++) map.set(c, String.fromCodePoint(cp + (c - lo)));
        }
      }
    }
  }
  cmapCache.set(num, map);
  return map;
}

const type0Cache = new Map();
function fontInfo(num) {
  if (!type0Cache.has(num)) {
    const o = objBody(num);
    const text = o ? o.text : '';
    const isType0 = /\/Subtype\s*\/Type0/.test(text);
    const tu = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(text);
    // 简单字体：/FirstChar + /Widths 数组，单位是 1/1000 em
    const firstChar = /\/FirstChar\s+(\d+)/.exec(text);
    const widthsM = /\/Widths\s*\[([^\]]*)\]/.exec(text);
    const widths = widthsM ? (widthsM[1].match(/[+-]?[\d.]+/g) || []).map(Number) : null;
    type0Cache.set(num, {
      isType0,
      toUnicode: tu ? +tu[1] : null,
      firstChar: firstChar ? +firstChar[1] : 0,
      widths,
    });
  }
  return type0Cache.get(num);
}

function decodeHexStr(h, fnum) {
  if (!fnum) return hexToStr(h);
  const info = fontInfo(fnum);
  const map = info.toUnicode ? cmapOf(info.toUnicode) : info.isType0 ? cmapOf(fnum) : null;
  if (map && map.size) {
    let out = '';
    for (let i = 0; i < h.length; i += 4) out += map.get(parseInt(h.slice(i, i + 4), 16)) ?? '\ufffd';
    return out;
  }
  return hexToStr(h);
}

// WinAnsiEncoding 里 0x80-0x9F 的排版符号（PDF 常见：’ “ ” – — …），
// 直接按 latin1 解码会变成控制字符，导致「sb's」这类词头被截断，所以要显式映射。
const WIN_ANSI = {
  0x80: '\u20ac', 0x82: '\u201a', 0x83: '\u0192', 0x84: '\u201e', 0x85: '\u2026', 0x86: '\u2020',
  0x87: '\u2021', 0x88: '\u02c6', 0x89: '\u2030', 0x8a: '\u0160', 0x8b: '\u2039', 0x8c: '\u0152',
  0x8e: '\u017d', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201c', 0x94: '\u201d', 0x95: '\u2022',
  0x96: '\u2013', 0x97: '\u2014', 0x98: '\u02dc', 0x99: '\u2122', 0x9a: '\u0161', 0x9b: '\u203a',
  0x9c: '\u0153', 0x9e: '\u017e', 0x9f: '\u0178',
};

function decodeBytes(bytes, fnum) {
  if (fnum && fontInfo(fnum).isType0) {
    return decodeHexStr(Buffer.from(bytes).toString('hex'), fnum);
  }
  let out = '';
  for (const b of bytes) out += WIN_ANSI[b] ?? String.fromCharCode(b);
  return out;
}

// —— 内容流 tokenizer：正确处理 PDF 字符串转义（\ddd、\(、\\）——
function tokenize(content) {
  const tokens = [];
  let i = 0;
  const n = content.length;
  while (i < n) {
    const c = content[i];
    if (c === '%') {
      while (i < n && content[i] !== '\n' && content[i] !== '\r') i++;
      continue;
    }
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0') {
      i++;
      continue;
    }
    if (c === '(') {
      const bytes = [];
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const ch = content[i];
        if (ch === '\\') {
          const nx = content[i + 1];
          if (nx >= '0' && nx <= '7') {
            let oct = '';
            let j = i + 1;
            while (j < n && oct.length < 3 && content[j] >= '0' && content[j] <= '7') {
              oct += content[j];
              j++;
            }
            bytes.push(parseInt(oct, 8) & 0xff);
            i = j;
            continue;
          }
          const map = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
          if (nx in map) {
            bytes.push(map[nx]);
            i += 2;
            continue;
          }
          if (nx === '\n') {
            i += 2;
            continue;
          }
          i += 1;
          continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        bytes.push(content.charCodeAt(i) & 0xff);
        i++;
      }
      tokens.push({ t: 'str', bytes });
      continue;
    }
    if (c === '<') {
      if (content[i + 1] === '<') {
        tokens.push({ t: 'op', v: '<<' });
        i += 2;
        continue;
      }
      let j = i + 1;
      let hex = '';
      while (j < n && content[j] !== '>') {
        hex += content[j];
        j++;
      }
      tokens.push({ t: 'hex', v: hex.replace(/[^0-9A-Fa-f]/g, '') });
      i = j + 1;
      continue;
    }
    if (c === '>' && content[i + 1] === '>') {
      tokens.push({ t: 'op', v: '>>' });
      i += 2;
      continue;
    }
    if (c === '[' || c === ']') {
      tokens.push({ t: 'op', v: c });
      i++;
      continue;
    }
    if (c === '/') {
      let j = i + 1;
      let name = '';
      while (j < n && !/[\s/\[\]<>(){}%]/.test(content[j])) {
        name += content[j];
        j++;
      }
      tokens.push({ t: 'name', v: name });
      i = j;
      continue;
    }
    let j = i;
    let word = '';
    while (j < n && !/[\s/\[\]<>(){}%]/.test(content[j])) {
      word += content[j];
      j++;
    }
    if (word) {
      if (/^[+-]?[\d.]+$/.test(word)) tokens.push({ t: 'num', v: +word });
      else tokens.push({ t: 'op', v: word });
      i = j;
    } else {
      i++;
    }
  }
  return tokens;
}

function subDictBody(text, key) {
  const fi = text.indexOf(key);
  if (fi < 0) return null;
  const i = text.indexOf('<<', fi);
  if (i < 0) return null;
  let depth = 0;
  let end = -1;
  for (let p = i; p < text.length; p++) {
    if (text.startsWith('<<', p)) {
      depth++;
      p++;
    } else if (text.startsWith('>>', p)) {
      depth--;
      if (depth === 0) {
        end = p;
        break;
      }
      p++;
    }
  }
  return end < 0 ? null : text.slice(i + 2, end);
}

function refMap(text, key) {
  const body = subDictBody(text, key);
  const out = {};
  if (!body) return out;
  const re = /\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+0\s+R/g;
  let m;
  while ((m = re.exec(body))) out[m[1]] = +m[2];
  return out;
}

function textOfArray(arr, fnum) {
  let out = '';
  for (const it of arr) {
    if (it.t === 'str') out += decodeBytes(it.bytes, fnum);
    else if (it.t === 'hex') out += decodeHexStr(it.v, fnum);
  }
  return out;
}

function extractRuns(content, resources, runs, depth = 0) {
  const fonts = refMap(resources, '/Font');
  const xobjs = refMap(resources, '/XObject');
  const tokens = tokenize(content);
  const stack = [];
  let cur = { x: 0, y: 0, size: 0 };
  let fnum;
  let fontName = '';
  let arr = null;
  let arrDepth = 0;
  for (const tk of tokens) {
    if (tk.t !== 'op') {
      if (arr) arr.push(tk);
      else stack.push(tk);
      continue;
    }
    const op = tk.v;
    if (op === '[') {
      arr = [];
      arrDepth = 1;
      continue;
    }
    if (op === ']') {
      if (arr) {
        stack.push({ t: 'arr', items: arr });
        arr = null;
      }
      continue;
    }
    if (op === '<<' || op === '>>') continue;
    if (op === 'Tf') {
      const name = stack.filter((x) => x.t === 'name').pop();
      if (name) {
        fontName = name.v;
        fnum = fonts[name.v];
      }
      stack.length = 0;
      continue;
    }
    if (op === 'Tm') {
      const nums = stack.filter((x) => x.t === 'num').map((x) => x.v);
      if (nums.length >= 6) cur = { x: nums[4], y: nums[5], size: Math.abs(nums[0]) || cur.size };
      stack.length = 0;
      continue;
    }
    if (op === 'Td' || op === 'TD') {
      const nums = stack.filter((x) => x.t === 'num').map((x) => x.v);
      if (nums.length >= 2) cur = { x: cur.x + nums[0], y: cur.y + nums[1], size: cur.size };
      stack.length = 0;
      continue;
    }
    if (op === 'Tj' || op === "'" || op === '"') {
      const last = stack[stack.length - 1];
      if (last && (last.t === 'str' || last.t === 'hex')) {
        const text = last.t === 'str' ? decodeBytes(last.bytes, fnum) : decodeHexStr(last.v, fnum);
        if (text.trim()) runs.push({ ...cur, font: fontName, fnum, adj: 0, text });
      }
      stack.length = 0;
      continue;
    }
    if (op === 'TJ') {
      const last = stack[stack.length - 1];
      if (last && last.t === 'arr') {
        const text = textOfArray(last.items, fnum);
        // TJ 里的数字是字距微调（单位 1/1000 em，正值把笔往回拉），
        // 不计入的话算出的 run 末端会偏右，词间空格就被算没了。
        const adj = last.items.reduce((a, it) => a + (it.t === 'num' ? it.v : 0), 0);
        if (text.trim()) runs.push({ ...cur, font: fontName, fnum, adj, text });
      }
      stack.length = 0;
      continue;
    }
    if (op === 'Do') {
      const name = stack.filter((x) => x.t === 'name').pop();
      if (name && xobjs[name.v] && depth < 6) {
        const st = streamOf(xobjs[name.v]);
        if (st && st.data) {
          const res = subDictBody(st.dict, '/Resources') ?? resources;
          extractRuns(st.data.toString('latin1'), res, runs, depth + 1);
        }
      }
      stack.length = 0;
      continue;
    }
    stack.length = 0;
    void arrDepth;
  }
  return runs;
}

function pageObjects() {
  const out = [];
  const re = /(\d+)\s+0\s+obj/g;
  let m;
  while ((m = re.exec(s))) {
    const at = m.index + m[0].length;
    const end = s.indexOf('endobj', at);
    const body = s.slice(at, end);
    if (/\/Type\s*\/Page[^s]/.test(body)) out.push({ num: +m[1], body });
  }
  return out;
}

function pageRuns(page) {
  const runs = [];
  const cm = /\/Contents\s+(\d+)\s+0\s+R/.exec(page.body);
  if (!cm) return runs;
  const cst = streamOf(+cm[1]);
  if (!cst || !cst.data) return runs;
  const content = cst.data.toString('latin1');
  const resources = subDictBody(page.body, '/Resources') ?? page.body;
  const xobjs = refMap(resources, '/XObject');
  const names = Object.keys(xobjs);
  if (names.length) {
    for (const n of names) {
      const st = streamOf(xobjs[n]);
      if (!st || !st.data) continue;
      const res = subDictBody(st.dict, '/Resources') ?? resources;
      extractRuns(st.data.toString('latin1'), res, runs);
    }
  } else {
    extractRuns(content, resources, runs);
  }
  return runs;
}

// 页脚（页码/书名）在 y≈32，页眉「Vocabulary in Each Unit」用 22 号字；
// 正文最上一行也在 y≈692，所以不能整段按 y 切，只丢掉页脚与大字号页眉。
const BODY_BOTTOM = 45;
const HEADER_BAND = 686;

function keepRun(r) {
  if (r.y < BODY_BOTTOM) return false;
  if (r.y > HEADER_BAND && r.size >= 20) return false;
  if (/Vocabulary in Each Unit/i.test(r.text)) return false;
  return true;
}

// 每页左右两栏的版心不同（奇偶页镜像），用页码 run（p.N，右对齐、x 固定）求分割线
function columnSplit(runs) {
  const pnX = [...new Set(runs.filter((r) => /^p\.\s*\d+$/.test(r.text.trim())).map((r) => Math.round(r.x)))].sort((a, b) => a - b);
  if (pnX.length >= 2) {
    let bi = 0;
    let bg = -1;
    for (let i = 1; i < pnX.length; i++) {
      const g = pnX[i] - pnX[i - 1];
      if (g > bg) {
        bg = g;
        bi = i;
      }
    }
    const leftPn = pnX[bi - 1];
    const counts = new Map();
    for (const r of runs) {
      const k = Math.round(r.x);
      if (k > leftPn + 25) counts.set(k, (counts.get(k) || 0) + 1);
    }
    const maxC = Math.max(0, ...counts.values());
    const starts = [...counts.entries()].filter(([, c]) => c >= Math.max(3, maxC * 0.5)).map(([k]) => k).sort((a, b) => a - b);
    if (starts.length) return (leftPn + 24 + starts[0]) / 2;
  }
  return 288;
}

function groupLines(runs) {
  const lines = [];
  for (const r of [...runs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const tol = Math.max(2, r.size * 0.35);
    const line = lines.find((l) => Math.abs(l.y - r.y) <= tol);
    if (line) {
      line.runs.push(r);
      line.y = (line.y * (line.runs.length - 1) + r.y) / line.runs.length;
    } else {
      lines.push({ y: r.y, runs: [r] });
    }
  }
  for (const l of lines) l.runs.sort((a, b) => a.x - b.x);
  lines.sort((a, b) => b.y - a.y);
  return lines;
}

// —— 单行内拼接：按 x 间隙判断是否要补空格（同词被拆成多 run 时不补）——
function charWidth(ch, size) {
  if (/[\u3000-\u9fff\uff00-\uffef]/.test(ch)) return size;
  if (ch === ' ') return size * 0.28;
  if (/[A-Z]/.test(ch)) return size * 0.66;
  if (/[a-z0-9]/.test(ch)) return size * 0.52;
  return size * 0.32;
}
function textWidth(text, size) {
  let w = 0;
  for (const ch of text) w += charWidth(ch, size);
  return w;
}
// 优先用字体自带的 /Widths 算真实宽度（误差 0），否则退回按字符类估算。
// 这一步很关键：词间空格只有 ~3.6px，估算宽度误差 ±2~4px 会让阈值失效、把两个词粘在一起。
function runTextWidth(r) {
  const adv = (r.adj || 0) / 1000 * r.size;
  const info = r.fnum ? fontInfo(r.fnum) : null;
  if (info && info.widths && !info.isType0) {
    let w = 0;
    for (const ch of r.text) {
      const code = ch.codePointAt(0);
      const idx = code - info.firstChar;
      if (code > 0xff || idx < 0 || idx >= info.widths.length) return textWidth(r.text, r.size) - adv;
      w += (info.widths[idx] / 1000) * r.size;
    }
    return w - adv;
  }
  return textWidth(r.text, r.size) - adv;
}
function joinRuns(runs) {
  let out = '';
  let prevEnd = null;
  for (const r of runs) {
    // PDF 的词间空格写在文本里（如 "away "），run 边界多为排版折行。
    // 实测：同一词被拆开的 run 间隙恒为 ~0，真正的词间空隙落在 1.8~2.4px，取 1.1px 作分界。
    if (prevEnd !== null) {
      const gap = r.x - prevEnd;
      if (gap > SPACE_GAP && !/\s$/.test(out) && !/^\s/.test(r.text)) out += ' ';
    }
    out += r.text;
    prevEnd = r.x + runTextWidth(r);
  }
  return out.replace(/\s+/g, ' ').trim();
}

const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;
const SPACE_GAP = 1.1;
const POS = '(?:n|v|vt|vi|adj|adv|prep|pron|conj|modal\\s+v|art|num|int|pl|abbr|aux)';

// 类型感知的空格修补：拉丁↔音标↔中文边界补一个空格
function fixSpacing(text) {
  let t = text;
  // 未映射 CID（多半是词中间的单引号 ’）：夹在字母之间就还原成不带引号的紧邻或单引号
  t = t.replace(/([A-Za-z])\ufffd+([A-Za-z])/g, "$1'$2");
  t = t.replace(/\ufffd+/g, '');
  t = t.replace(/([A-Za-z0-9.)]) (?=\/)/g, '$1 ');
  t = t.replace(/([A-Za-z0-9.）)])(\/[^\/]*\/)/g, '$1 $2');
  t = t.replace(/(\/[^\/]*\/)(?=[A-Za-z\u4e00-\u9fff(（])/g, '$1 ');
  t = t.replace(/([A-Za-z0-9.]) ?([\u4e00-\u9fff（])/g, '$1 $2');
  t = t.replace(/([\u4e00-\u9fff）])([A-Za-z])/g, '$1 $2');
  // 偶尔把 "with sb" 的 sb/sth 粘在单词尾巴上（PDF 少印了一个空格）
  t = t.replace(/([a-z]{2,})(s(?:b|th))(?=[\s/]|$)/g, '$1 $2');
  return t.replace(/\s+/g, ' ').trim();
}

function splitColumns(lines, splitX) {
  const left = [];
  const right = [];
  for (const l of lines) {
    const lr = l.runs.filter((r) => r.x < splitX);
    const rr = l.runs.filter((r) => r.x >= splitX);
    if (lr.length) left.push({ y: l.y, text: fixSpacing(joinRuns(lr)) });
    if (rr.length) right.push({ y: l.y, text: fixSpacing(joinRuns(rr)) });
  }
  return { left, right };
}

const NOISE = [/^Vocabulary in Each Unit/, /^Words and Expressions/, /^\d+$/, /^Unit \d+$/, /^（注：/, /^\(注：/];

// 连字/未映射 CID 被解成控制字符。实测本 PDF 只有 4 种：
// 0x1c=孤立符号（丢弃）、0x1d=fl、0x1e=tt、0x1f=ft（夹在两个中文字之间时是间隔号 ·）
function fixLigatures(text) {
  return text
    .replace(/([\u4e00-\u9fff])\s*[\u001c-\u001f]\s*([\u4e00-\u9fff])/g, '$1·$2')
    .replace(/\u001c/g, '')
    .replace(/\u001d/g, 'fl')
    .replace(/\u001e/g, 'tt')
    .replace(/\u001f/g, 'ft');
}

function parseEntry(raw) {
  let text = fixLigatures(raw)
    .replace(/p\.\s*\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  let phonetic = '';
  const ph = /(?:^|\s)(\/[^/]{1,40}\/)/.exec(text);
  let head = text;
  let rest = '';
  if (ph) {
    head = text.slice(0, ph.index);
    phonetic = ph[1];
    rest = text.slice(ph.index + ph[0].length);
  } else {
    const m = new RegExp('^([A-Za-z][A-Za-z0-9\'’.\\- ]*?)(?=\\s+' + POS + '\\.|\\s*[\\u4e00-\\u9fff（]|' + POS + '\\.)').exec(text);
    if (m) {
      head = m[1];
      rest = text.slice(m[1].length);
    }
  }
  head = head.trim().replace(/^[^A-Za-z]+/, '').replace(/[.,;:]+$/, '').trim();
  if (!head || !/[A-Za-z]/.test(head)) return null;
  if (!/^[A-Za-z][A-Za-z0-9'’.\- ]*$/.test(head)) {
    // 头部混进了中文/符号，退化为「取开头拉丁串」
    const m = /^[A-Za-z][A-Za-z0-9'’.\- ]*/.exec(head);
    if (!m) return null;
    rest = head.slice(m[0].length) + rest;
    head = m[0].trim();
  }
  // 「might modal v.」这类：词性词被并进词头，剥回去
  const POSWORD = new RegExp('\\s+(?:' + POS + ')(?:\\s+v)?$');
  for (let i = 0; i < 2; i++) {
    const m = POSWORD.exec(head);
    if (!m) break;
    rest = head.slice(m.index).trim() + (rest ? ' ' + rest : '');
    head = head.slice(0, m.index).trim();
  }
  // 音标插在词头中间的情况（如 Guest-Greeting /ˈɡest ˌɡriːtɪŋ/ Pine / paɪn/）：
  // 音标后面紧跟的拉丁词并入词头，直到遇到词性/中文/下一个音标
  if (phonetic && rest) {
    const m = new RegExp('^\\s*([A-Za-z][A-Za-z0-9\'’.\\- ]*?[A-Za-z])(?=\\s+' + POS + '\\.|\\s*[\\u4e00-\\u9fff（]|\\s*\\/|$)').exec(rest);
    if (m && !new RegExp('^' + POS + '$').test(m[1].trim()) && m[1].length <= 30) {
      head = (head + ' ' + m[1].trim()).replace(/\s+/g, ' ');
      rest = rest.slice(m[0].length);
      // 词头里第二个音标（Pine 的 /paɪn/）并到 phonetic 后面，别漏进释义
      const ph2 = /^\s*(\/\s*[^/]{1,40}\/)/.exec(rest);
      if (ph2) {
        phonetic = phonetic + ' ' + ph2[1].replace(/\/\s+/, '/');
        rest = rest.slice(ph2[0].length);
      }
    }
  }
  // 词头的第二种写法（fight against sb / sth）并入词头
  const alt = /^\s*(\/\s*(?:sth|sb)[^/\u4e00-\u9fff]*)/.exec(rest);
  if (alt && !phonetic) {
    head = (head + ' ' + alt[1].trim()).replace(/\s+/g, ' ');
    rest = rest.slice(alt[0].length);
  }
  const mean = rest
    .replace(/\s+/g, ' ')
    .replace(/^[.,;:\s]+/, '')
    .replace(new RegExp('^(' + POS + ')\\s+'), '$1. ')
    .trim();
  if (process.env.DEBUG_RAW) {
    const want = process.env.DEBUG_RAW.toLowerCase();
    if (raw.toLowerCase().includes(want)) console.log('RAW:', JSON.stringify(raw), '\n ->', JSON.stringify({ word: head, phonetic, mean }));
  }
  return { word: head, phonetic, mean };
}

function collectEntries(columnLines) {
  const entries = [];
  let buffer = [];
  const flush = () => {
    if (!buffer.length) return;
    const raw = buffer.join(' ');
    buffer = [];
    const e = parseEntry(raw);
    if (e) entries.push(e);
  };
  const POSSTART = new RegExp('^(?:' + POS + ')\\s*\\.');
  const body = columnLines.map((l) => l.text.trim()).filter((t) => t && !NOISE.some((re) => re.test(t)));
  // 形如新词头的行：以拉丁字母开头、不是词性续行、也不是页码
  const startsEntry = (t) => /^[A-Za-z]/.test(t) && !POSSTART.test(t) && !/^p\.\s*\d/.test(t);
  for (let i = 0; i < body.length; i++) {
    const text = body[i];
    const next = body[i + 1];
    // 上一条还没结束就撞上新词头（如 mix 的 "n. 混合…" 之后紧跟 bake），先把上一条收掉
    if (buffer.length && startsEntry(text) && buffer.some((t) => CJK.test(t))) flush();
    buffer.push(text);
    // 页码 p.N 一般标在条目末行；但 mix/boil 这类多词性条目会把 p.N 印在第一行，
    // 所以后面紧跟词性续行时不能收尾。
    if (/p\.\s*\d+/.test(text) && !(next && POSSTART.test(next))) flush();
  }
  flush();
  return entries;
}

const pages = pageObjects();
const rawLines = [];
// 每页两栏按「左栏自上而下 → 右栏自上而下」连成一条流，条目可跨栏
const lineStream = [];
for (const p of pages) {
  const runs = pageRuns(p).filter(keepRun);
  const lines = groupLines(runs);
  if (DEBUG) {
    console.log('===== page obj', p.num, '=====');
    for (const l of lines) console.log(l.y.toFixed(1), '|', l.runs.map((r) => r.text).join('|'));
  }
  const cols = splitColumns(lines, columnSplit(runs));
  rawLines.push({ page: p.num, ...cols });
  lineStream.push(...cols.left, ...cols.right);
}
const allEntries = collectEntries(lineStream);

if (process.env.DEBUG_BYTES === '1') {
  const target = process.env.DEBUG_MATCH || 'sbs';
  const page = Number(process.env.DEBUG_PAGE || 0);
  const p = pages[page];
  const runs = pageRuns(p);
  for (const r of runs) {
    if (r.text.includes(target)) console.log(r.x, r.y, r.font, JSON.stringify(r.text), [...r.text].map((c) => c.codePointAt(0).toString(16)).join(' '));
  }
  process.exit(0);
}
if (process.env.DEBUG_X === '1') {
  const page = Number(process.env.DEBUG_PAGE || 0);
  const runs = pageRuns(pages[page]);
  const xs = runs.map((r) => Math.round(r.x)).sort((a, b) => a - b);
  console.log('page idx', page, 'runs', runs.length);
  console.log(xs.join(' '));
  if (process.env.DEBUG_DUMP === '1') {
    for (const r of [...runs].sort((a, b) => a.x - b.x)) console.log(Math.round(r.x), r.y.toFixed(1), Math.round(r.size), JSON.stringify(r.text));
  }
  process.exit(0);
}
if (process.env.DEBUG_JOIN === '1') {
  const page = rawLines[Number(process.env.DEBUG_PAGE || 0)];
  console.log('===== page', page.page, 'LEFT =====');
  for (const l of page.left) console.log(l.y.toFixed(1), l.text);
  console.log('===== page', page.page, 'RIGHT =====');
  for (const l of page.right) console.log(l.y.toFixed(1), l.text);
  process.exit(0);
}

const seen = new Set();
const words = [];
for (const e of allEntries) {
  const key = e.word.toLowerCase();
  if (!key || seen.has(key)) continue;
  seen.add(key);
  words.push({ word: e.word, phonetic: e.phonetic, mean: e.mean, sentence: '' });
}

fs.writeFileSync(OUT, JSON.stringify(words, null, 2) + '\n');
const noPhonetic = words.filter((w) => !w.phonetic).length;
const noMean = words.filter((w) => !/[^\x00-\x7f]/.test(w.mean) && !w.mean).length;
console.log('pages:', pages.length, 'entries:', allEntries.length, 'unique:', words.length);
console.log('missing phonetic:', noPhonetic, 'missing mean:', noMean);
if (process.env.DEBUG_PARSE === '1' || process.env.DEBUG_SAMPLE === '1') {
  for (const w of words.slice(0, 30)) console.log(JSON.stringify(w));
}
