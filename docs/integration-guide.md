# Integration guide

## 1. Copy the files

Drop `sections/frequently-bought-together.liquid` and
`assets/frequently-bought-together.js` into your theme as-is, and merge the
locale keys from `locales/` into your theme's own `locales/en.default.json`,
`locales/en.default.schema.json`, `locales/fr.json` and
`locales/fr.schema.json` (or add a new language pair the same way).

This is a **section**, not a block — it works anywhere sections work: any
page template, or any custom `sections` group, not just a product page.

## 2. Add it in the theme editor

Open any page in the theme editor, click **Add section**, and pick
"Frequently bought together" (or whatever you named it via the `names.*`
locale key). Two ways to point it at a product:

- **On a product page**, leave the "Product" setting empty — it defaults to
  `closest.product`, i.e. whichever product the page is currently showing.
- **On any other page** (home page, custom page…), the "Product" setting is
  required — pick one explicitly.

## 3. Make it show up automatically on every product page (optional)

Adding it by hand on every product gets old fast. If your theme's products
mostly share one template (commonly `templates/product.json`), add the
section directly to that template's JSON once, and it appears on every
product using it without further action. See
`docs/product-json-snippet.json` for a ready-to-adapt entry — add it to the
template's `"sections"` object and reference its key in the `"order"` array.

## 4. Complementary products: automatic vs. manual

- **Automatic (default):** leave the "Complementary products" setting
  empty. The section fetches Shopify's own `complementary` product
  recommendations (`routes.product_recommendations_url`, JSON response) for
  whichever product it's bound to. Requires no setup, but a store with
  little order history may see nothing for a while — Shopify's
  recommendation engine needs co-purchase data to work with.
- **Manual override:** fill in up to 3 products in "Complementary products"
  to force specific pairings, bypassing the automatic engine entirely for
  that instance.

## 5. Optional: Bundle Selector integration

If your theme also has a "buy more, save more" tier picker that dispatches
a custom `bundle-tier:change` event with `data-per-unit-price` /
`data-unit-count` on the selected tier's radio input (see
[shopify-bundle-selector](https://github.com/pteyo032/shopify-bundle-selector)),
this section listens for it automatically and keeps its price/quantity in
sync — no extra wiring needed. Without that feature installed, this is a
silent no-op; nothing breaks.
