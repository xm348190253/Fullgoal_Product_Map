# 富国基金 · 产品全景

这是一个静态网页工作台，用来查看富国基金产品池、投资类型分布、风险收益矩阵、产品明细和数据健康状态。

现在页面使用“两层数据架构”：

- 第一层：产品池，决定页面里有哪些基金。页面优先读取 `data/fullgoal_product_pool_latest.json`。
- 第二层：动态数据，只更新产品池里已有基金代码的估值、净值、规模、基金经理和收益数据。

如果线上产品池读取失败，页面会自动退回 `products_full.js` 离线备用池，并在顶部和健康面板提示。

## 本地打开

直接双击 `index.html`，用 Edge 或 Chrome 打开即可。

本地双击时，浏览器可能不允许读取 `data/fullgoal_product_pool_latest.json`。这种情况下页面会使用 `products_full.js` 兜底，不会白屏。已有基金的实时估值和业绩接口如果能联网访问，仍会继续刷新；访问失败的字段显示 `--`。

## GitHub Pages 部署

推荐把仓库发布到 GitHub Pages，让所有人访问同一个网址。

1. 打开 GitHub 仓库。
2. 进入 `Settings` -> `Pages`。
3. `Source` 选择 `Deploy from a branch`。
4. 分支选择 `main`，目录选择 `/root`。
5. 保存后等待 GitHub 生成网址。

当前规划的公开地址见 `TASKS.md`。

## 更新产品池

手动更新本地 JSON：

```powershell
node scripts/update_fullgoal_product_pool.js
```

脚本会从天天基金 / 东方财富公开基金列表抓取富国基金产品，标准化后写入：

```text
data/fullgoal_product_pool_latest.json
```

如果接口失败，脚本不会覆盖已有 JSON。

## GitHub Actions 自动更新

仓库包含 `.github/workflows/update-product-pool.yml`。

- 每天自动运行一次。
- 支持在 GitHub Actions 页面点击 `Run workflow` 手动触发。
- 如果 JSON 有变化，会自动提交：

```text
chore: update fullgoal product pool
```

## 查看数据源状态

页面顶部会显示：

- 产品池来源：线上最新 / 本地兜底
- 产品池更新时间
- 产品池总数
- ETF 本体数量
- ETF 联接数量
- 动态数据刷新时间

右上角铃铛打开“数据健康面板”，可以看到 ETF、LOF、QDII、FOF 数量，缺失规模 / 基金经理数量，以及 `fundgz` 和 `pingzhongdata` 的成功失败数。

## ETF 本体和 ETF 联接

ETF 本体是场内交易基金，通常有交易所代码，例如 `159xxx`、`51xxxx`。

ETF 联接基金是场外基金，投资目标通常是跟踪某只 ETF，但它不是 ETF 本体。

页面在“产品形态”列里明确区分：

- ETF 本体
- ETF 联接
- LOF
- FOF
- QDII
- 货币基金
- REITs
- 普通开放式基金

搜索 `ETF` 时，ETF 本体和 ETF 联接都会保留展示，不会因为份额合并逻辑被错误合并。

## 管理规模口径

顶部第一张 KPI 是公司层面的“公募管理规模”：

```text
13,289.12 亿元
```

这是公司口径，不是当前产品池逐只基金规模简单相加。

页面仍会计算“当前产品池规模合计”，但会在副标题和健康面板中明确说明它不是公司官方管理规模。

## 文件结构

```text
Fullgoal_Product_Map/
├── index.html
├── products_full.js
├── data/
│   └── fullgoal_product_pool_latest.json
├── scripts/
│   ├── generate_fullgoal_products.js
│   └── update_fullgoal_product_pool.js
├── .github/
│   └── workflows/
│       └── update-product-pool.yml
├── echarts.min.js
├── TASKS.md
└── README.md
```

## 数据声明

产品池优先来自本项目线上 JSON，该文件由 GitHub Actions 定时从公开数据源更新；接口失败时使用 `products_full.js` 离线备用池。基金实时估值、单位净值、历史收益、规模、基金经理等字段来自天天基金 / 东方财富公开接口。最终数据以富国基金官网披露为准。
