const fs = require('fs');
const https = require('https');
const vm = require('vm');

const FUND_SOURCE_URL = 'https://fund.eastmoney.com/js/fundcode_search.js';
const FULLGOAL_PREFIX = '富国';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
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
  return String(name || '').replace(/（/g, '(').replace(/）/g, ')');
}

function isBackEnd(name) {
  return normalizeName(name).includes('(后端)');
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

function primaryRank(item) {
  if (item._backEnd) return 100;
  const rank = { A: 0, 'A/B': 1, _: 2, B: 3, D: 4, I: 5, Y: 6, R: 7, C: 8, E: 9, H: 10 };
  return rank[item.shareClass] ?? 20;
}

(async () => {
  const sourceUrl = `${FUND_SOURCE_URL}?v=${Date.now()}`;
  const script = await fetchText(sourceUrl);
  const context = {};
  vm.runInNewContext(script, context);
  const raw = Array.isArray(context.r) ? context.r : [];
  const rows = raw
    .filter(row => row[0] && row[2] && row[2].startsWith(FULLGOAL_PREFIX))
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const products = rows.map(row => {
    const [code, shortName, name, type, fullname] = row;
    const meta = metaFor(type || '', name);
    const shareClass = shareClassOf(name);
    return {
      code,
      name,
      fullname: fullname || shortName || name,
      type: type || '',
      category: meta.category,
      subCategory: meta.subCategory,
      shareClass,
      isPrimary: true,
      benchmark: meta.benchmark,
      manager: '-',
      scale: null,
      annualReturn: null,
      maxDrawdown: null,
      sharpe: null,
      calmar: null,
      inception: '-',
      isFlagship: false,
      _autoFilled: true,
      _backEnd: isBackEnd(name),
      _familyBase: familyBase(name)
    };
  });

  const byFamily = new Map();
  for (const product of products) {
    const list = byFamily.get(product._familyBase) || [];
    list.push(product);
    byFamily.set(product._familyBase, list);
  }
  for (const list of byFamily.values()) {
    const primary = list
      .slice()
      .sort((a, b) => primaryRank(a) - primaryRank(b) || a.code.localeCompare(b.code))[0];
    for (const product of list) product.isPrimary = product === primary;
  }

  const output = products.map(({ _backEnd, _familyBase, ...product }) => product);
  const generatedAt = new Date().toISOString();
  const body = `// 富国基金产品池。数据源：天天基金 fundcode_search.js；生成时间：${generatedAt}\nwindow.FULLGOAL_FUND_POOL = ${JSON.stringify(output)};\n`;
  fs.writeFileSync('products_full.js', body, 'utf8');
  console.log(`generated ${output.length} Fullgoal products from ${raw.length} market rows`);
  console.log(`primary ${output.filter(p => p.isPrimary !== false).length}, variants ${output.filter(p => p.isPrimary === false).length}`);
})();
