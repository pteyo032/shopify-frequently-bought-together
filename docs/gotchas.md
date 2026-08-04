# Technical gotchas

Things that cost real debugging time while building this — recorded so you
don't have to rediscover them.

1. **Liquid's `assign` does not support inline boolean expressions the way
   `if`/`unless` do.** `assign show_section = product != blank and
   section.settings.enabled` looks valid but throws a silent
   `LiquidHTMLSyntaxError` from `shopify theme check` (and fails to render).
   Use the two-step pattern instead: `assign show_section = false` then
   `if ... assign show_section = true endif`.

2. **Schema locale vs. storefront locale are not interchangeable, even
   though both have a `content` namespace.** A string rendered directly in
   a section/block's markup (e.g. an empty-state message shown in
   `request.design_mode`) must live in `locales/en.default.json`'s
   `content` key — not `locales/en.default.schema.json`'s `content` key,
   which is only for the theme editor's own UI (settings labels, info
   text, block names). `shopify theme check`'s `TranslationKeyExists` rule
   catches this, but only if you actually run it.

3. **Blocks cannot be placed on arbitrary pages — only sections can.** A
   feature nested inside a page's block tree (e.g. a product page's block
   area) is permanently scoped to wherever that block type is allowed to be
   added. To make something reusable across any template, it has to be a
   **section** with an explicit `"type": "product"` setting and a
   `section.settings.product | default: product` fallback — the same
   pattern Shopify's own `sections/product-recommendations.liquid` uses in
   the Horizon theme. Converting from a block to a section mid-project also
   means re-adding it to any template JSON it was previously nested in.

4. **`this.refs` (the `@theme/component` base class's ref system) updates
   asynchronously via a `MutationObserver`.** Reading `this.refs.someRef`
   immediately after inserting a new `[ref]` element via JS (e.g. rows
   appended after an async fetch resolves) can return a stale, empty list —
   the observer's callback hasn't fired yet in the same synchronous tick.
   Query the DOM directly (`this.querySelectorAll(...)`) for anything
   inserted dynamically, rather than relying on `this.refs` for it.

5. **The Product Recommendations AJAX endpoint's response format depends
   entirely on whether `section_id` is present.**
   `routes.product_recommendations_url?product_id=X&intent=complementary`
   (no `section_id`) returns structured **JSON** (price, availability,
   images, variants); adding `&section_id=Y` instead returns a fully
   rendered **HTML** section fragment. Confirmed against Shopify's official
   docs — easy to miss since most theme examples only show the
   `section_id` (HTML) variant.

6. **The `product_list` schema setting type supports a native `"limit"`
   attribute** (max selectable items, up to 50) — not something obvious
   from most examples in the wild, but it means you don't have to enforce a
   cap manually with a Liquid `limit:` filter alone.

7. **Custom theme events don't necessarily carry an identifier to correlate
   them against.** A `bundle-tier:change`-style event only tells you a tier
   changed, not which product/instance it belongs to — if more than one
   relevant instance could exist on the same page, there's no reliable way
   to match them without adding your own identifier to the event's
   `detail`. Document the assumption ("there's at most one on the page")
   rather than silently getting it wrong.

8. **A radio/checkbox marked `checked` via server-rendered HTML (e.g. a
   "default selected" tier) does not fire a native `change` event on page
   load.** `change` only fires on real user interaction. Anything that
   needs to reflect that default state (a price sync, a total
   recalculation) has to run proactively once at `connectedCallback`, not
   only inside the event listener.
