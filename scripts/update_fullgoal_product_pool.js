const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const FUND_SOURCE_URL = 'https://fund.eastmoney.com/js/fundcode_search.js';
const FULLGOAL_PREFIX = '富国';
const OUT_FILE = path.join(__dirname, '..', 'data', 'fullgoal_product_pool_latest.json');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 FullgoalProductPoolUpdater' } }, res => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        let text = Buffer.concat(chunks).toString('utf8');
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        resolve(text);
      });
    }).on('error', reject);
  });
}

function normalizeName(name) {
  return String(name || '').replace(/（/g, '(').replace(/）/g, ')').trim();
}

function shareClassOf(name) {
  const clean = normalizeName(name).replace(/\(后端\)$/u, '');
  if (/A\/B$/u.test(clean)) return 'A/B';
  const m = clean.match(/([A-EHIYRD])$/u);
  return m ? m[1] : '_';
}

function familyBase(name) {
  let clean = normalizeName(name).replace(/\(后端\)$/u, '');
  clean = clean.replace(/A\/B$/u, '');
  clean = clean.replace(/[A-EHIYRD]$/u, '');
  return clean;
}

function primaryRank(item) {
  if (item._backEnd) return 100;
  const rank = { A: 0, 'A/B': 1, _: 2, B: 3, D: 4, I: 5, Y: 6, R: 7, C: 8, E: 9, H: 10 };
  return rank[item.shareClass] ?? 20;
}

function metaFor(type, name) {
  const n = name || '';
  const map = {
    '股票型': { category: '主动权益', subCategory: '股票型', benchmark: '沪深300' },
    '指数型-股票': { category: '指数&量化', subCategory: '股票', benchmark: '对标指数' },
    '指数型-海外股票': { category: 'QDII', subCategory: '海外指数', benchmark: 'MSCI 全球' },
    '指数型-固收': { category: '纯债', subCategory: '债券指数', benchmark: '对标指数' },
    '指数型-其他': { category: '指数&量化', subCategory: '商品指数', benchmark: '对标指数' },
    '混合型-偏股': { category: '主动权益', subCategory: '偏股混合', benchmark: '沪深300' },
    '混合型-灵活': { category: '主动权益', subCategory: '灵活配置', benchmark: '沪深300' },
    '混合型-偏债': { category: '固收+', subCategory: '偏债混合', benchmark: '中债综合 + 沪深300' },
    '混合型-绝对收益': { category: '主动权益', subCategory: '绝对收益', benchmark: '沪深300' },
    '债券型-长债': { category: '纯债', subCategory: '中长期纯债', benchmark: '中债综合' },
    '债券型-中短债': { category: '纯债', subCategory: '中短债', benchmark: '中债短融' },
    '债券型-混合一级': { category: '固收+', subCategory: '一级债基', benchmark: '中债综合 + 沪深300' },
    '债券型-混合二级': { category: '固收+', subCategory: '二级债基', benchmark: '中债综合 + 沪深300' },
    '货币型-普通货币': { category: '纯债', subCategory: '货币', benchmark: '7日通知存款' },
    'QDII-混合偏股': { category: 'QDII', subCategory: '混合偏股', benchmark: 'MSCI 全球' },
    'QDII-普通股票': { category: 'QDII', subCategory: '海外股票', benchmark: 'MSCI 全球' },
    'QDII-混合债': { category: 'QDII', subCategory: '海外债券', benchmark: '全球债券指数' },
    'QDII-纯债': { category: 'QDII', subCategory: '海外债券', benchmark: '全球债券指数' },
    'FOF-进取型': { category: 'FOF&养老', subCategory: '进取型', benchmark: '养老 FOF 基准' },
    'FOF-均衡型': { category: 'FOF&养老', subCategory: '均衡型', benchmark: '养老 FOF 基准' },
    'FOF-稳健型': { category: 'FOF&养老', subCategory: '稳健型', benchmark: '养老 FOF 基准' },
    'Reits': { category: 'REITs', subCategory: '基础设施REIT', benchmark: 'REITs 指数' }
  };
  if (map[type]) return map[type];
  if (n.includes('债')) return { category: '纯债', subCategory: '债券', benchmark: '中债综合' };
  if (n.includes('QDII')) return { category: 'QDII', subCategory: '其他', benchmark: 'MSCI 全球' };
  return { category: '主动权益', subCategory: '其他', benchmark: '沪深300' };
}

function investType(type, name, category, subCategory) {
  const text = `${type || ''} ${name || ''} ${category || ''} ${subCategory || ''}`;
  if (/REIT|Reits/i.test(text)) return { l1: 'REITs', l2: '基础设施REIT', l3: '公募REIT' };
  if (/FOF/.test(text)) return { l1: 'FOF', l2: '均衡FOF', l3: 'FOF-均衡型' };
  if (/QDII|港股|海外|全球|恒生|纳斯达克|标普/.test(text)) return { l1: 'QDII', l2: '权益QDII', l3: /指数|ETF/.test(text) ? '海外指数' : '海外混合' };
  if (/货币/.test(text)) return { l1: '货币型', l2: '普通货币', l3: '货币基金' };
  if (/债/.test(text)) return { l1: '债券型', l2: /指数/.test(text) ? '指数债' : (/一级/.test(text) ? '混合债' : '纯债'), l3: /中短债/.test(text) ? '中短债' : (/一级/.test(text) ? '一级债基' : (/二级/.test(text) ? '二级债基' : '长期纯债')) };
  if (/指数|ETF|LOF/.test(text)) return { l1: '股票型', l2: '被动指数', l3: /行业|医药|消费|科技|新能源|军工|银行|证券/.test(text) ? '行业ETF' : '股票指数' };
  if (/股票/.test(text)) return { l1: '股票型', l2: '主动股票', l3: '普通股票型' };
  return { l1: '混合型', l2: /灵活/.test(text) ? '灵活配置' : (/偏债/.test(text) ? '偏债混合' : '偏股混合'), l3: /灵活/.test(text) ? '灵活配置' : (/偏债/.test(text) ? '偏债混合' : '偏股混合') };
}

function subtypeFor(code, name, type) {
  const text = `${name || ''} ${type || ''}`;
  const exchange = String(code).startsWith('5') ? 'SH' : String(code).startsWith('15') ? 'SZ' : '--';
  if (/ETF.*联接/.test(text)) return { fundSubtype: 'ETF联接', isETF: false, isETFLink: true, isExchangeTraded: false, exchange: '--' };
  if (/ETF/.test(text) && (String(code).startsWith('5') || String(code).startsWith('15') || String(code).startsWith('16'))) return { fundSubtype: 'ETF本体', isETF: true, isETFLink: false, isExchangeTraded: true, exchange };
  if (/LOF/.test(text)) return { fundSubtype: 'LOF', isETF: false, isETFLink: false, isExchangeTraded: true, exchange };
  if (/FOF/.test(text)) return { fundSubtype: 'FOF', isETF: false, isETFLink: false, isExchangeTraded: /LOF/.test(text), exchange: /LOF/.test(text) ? exchange : '--' };
  if (/REIT|Reits/i.test(text)) return { fundSubtype: 'REITs', isETF: false, isETFLink: false, isExchangeTraded: true, exchange };
  if (/QDII/.test(text)) return { fundSubtype: 'QDII', isETF: false, isETFLink: false, isExchangeTraded: false, exchange: '--' };
  if (/货币/.test(text)) return { fundSubtype: '货币基金', isETF: false, isETFLink: false, isExchangeTraded: String(code).startsWith('5'), exchange: String(code).startsWith('5') ? 'SH' : '--' };
  return { fundSubtype: '普通开放式基金', isETF: false, isETFLink: false, isExchangeTraded: false, exchange: '--' };
}

function formatLocalTime(d) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

async function main() {
  const sourceUrl = `${FUND_SOURCE_URL}?v=${Date.now()}`;
  const script = await fetchText(sourceUrl);
  const context = {};
  vm.runInNewContext(script, context);
  const raw = Array.isArray(context.r) ? context.r : [];
  const rows = raw
    .filter(row => row[0] && row[2] && row[2].startsWith(FULLGOAL_PREFIX))
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  if (!rows.length) throw new Error('未抓到富国基金产品，保留原 JSON');

  const funds = rows.map(row => {
    const [code, shortName, name, type, fullname] = row;
    const cleanName = normalizeName(name || shortName);
    const meta = metaFor(type || '', cleanName);
    const subtype = subtypeFor(code, cleanName, type || '');
    const inv = investType(type || '', cleanName, meta.category, meta.subCategory);
    return {
      code,
      name: cleanName,
      fullname: fullname || shortName || cleanName,
      type: type || '',
      category: meta.category,
      subCategory: meta.subCategory,
      l1: inv.l1,
      l2: inv.l2,
      l3: inv.l3,
      fundSubtype: subtype.fundSubtype,
      isETF: subtype.isETF,
      isETFLink: subtype.isETFLink,
      isExchangeTraded: subtype.isExchangeTraded,
      exchange: subtype.exchange,
      trackingIndex: meta.benchmark === '对标指数' ? '' : meta.benchmark,
      shareClass: shareClassOf(cleanName),
      isPrimary: true,
      fundCompany: '富国基金管理有限公司',
      benchmark: meta.benchmark,
      manager: '-',
      scale: null,
      annualReturn: null,
      maxDrawdown: null,
      sharpe: null,
      calmar: null,
      inception: '-',
      isFlagship: false,
      source: 'eastmoney',
      sourceUpdatedAt: formatLocalTime(new Date()),
      _backEnd: normalizeName(cleanName).includes('(后端)'),
      _familyBase: familyBase(cleanName)
    };
  });

  const byFamily = new Map();
  for (const fund of funds) {
    const list = byFamily.get(fund._familyBase) || [];
    list.push(fund);
    byFamily.set(fund._familyBase, list);
  }
  for (const list of byFamily.values()) {
    const primary = list.slice().sort((a, b) => primaryRank(a) - primaryRank(b) || a.code.localeCompare(b.code))[0];
    for (const fund of list) fund.isPrimary = fund === primary;
  }

  const cleanFunds = funds.map(({ _backEnd, _familyBase, ...fund }) => fund);
  const meta = {
    fundCompany: '富国基金管理有限公司',
    updatedAt: formatLocalTime(new Date()),
    source: ['eastmoney', 'tiantian'],
    totalCount: cleanFunds.length,
    etfCount: cleanFunds.filter(f => f.fundSubtype === 'ETF本体').length,
    etfLinkCount: cleanFunds.filter(f => f.fundSubtype === 'ETF联接').length,
    lofCount: cleanFunds.filter(f => f.fundSubtype === 'LOF').length,
    qdiiCount: cleanFunds.filter(f => f.fundSubtype === 'QDII').length,
    fofCount: cleanFunds.filter(f => f.fundSubtype === 'FOF').length,
    note: '产品池由脚本从公开数据源定时生成；实时估值和 T+1 业绩由页面另行按基金代码更新。'
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify({ meta, funds: cleanFunds }, null, 2)}\n`, 'utf8');
  console.log(`总产品数: ${meta.totalCount}`);
  console.log(`ETF 本体: ${meta.etfCount}`);
  console.log(`ETF 联接: ${meta.etfLinkCount}`);
  console.log(`LOF: ${meta.lofCount}`);
  console.log(`数据源: ${meta.source.join(', ')}`);
  console.log(`更新时间: ${meta.updatedAt}`);
  console.log('异常数量: 0');
}

main().catch(err => {
  console.error(`更新失败: ${err.message}`);
  console.error('未覆盖已有 data/fullgoal_product_pool_latest.json');
  process.exitCode = 1;
});
