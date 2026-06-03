# TASKS

## Deployment

- Use GitHub Pages to publish this static project.
- Public URL after deployment: https://xm348190253.github.io/Fullgoal_Product_Map/
- The site is served directly from the repository root on the `main` branch.

## Data Architecture

- Product pool is the first data layer. `index.html` should prefer `data/fullgoal_product_pool_latest.json`.
- `products_full.js` is only an offline fallback when the JSON cannot be loaded.
- Dynamic fund data is the second data layer. `fundgz` and `pingzhongdata` only update data for fund codes that already exist in the product pool.
- ETF bodies and ETF link funds must remain separate products. Do not merge ETF bodies into ETF link fund families.
- The top KPI "公募管理规模" uses the company-level public scale `13,289.12 亿元`. Current product-pool scale totals may be shown, but must be labeled as product-pool aggregation, not company AUM.
