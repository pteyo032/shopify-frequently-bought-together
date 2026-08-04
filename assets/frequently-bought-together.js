import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { formatMoney } from '@theme/money-formatting';
import { ThemeEvents } from '@theme/events';
import { StandardEvents, CartLinesUpdateEvent, CartErrorEvent } from '@shopify/events';

/**
 * Renders the main product's thumbnail + up to 3 complementary product thumbnails
 * (manually chosen by the merchant, or sourced from Shopify's native "complementary"
 * recommendations when no manual selection is configured), connected by "+" signs. No
 * per-item selection — a single "Add to cart" button always submits the main product
 * (current page variant) plus every complementary product shown, as one multi-item
 * request.
 *
 * @typedef {object} FrequentlyBoughtTogetherRefs
 * @property {HTMLElement} rowList
 * @property {HTMLElement} [mainProductPrice]
 * @property {HTMLElement[]} [complementaryRows]
 * @property {HTMLElement} [skeleton]
 * @property {HTMLElement} totalPrice
 * @property {HTMLButtonElement} addToCartButton
 * @property {HTMLElement} [addToCartButtonText]
 * @property {HTMLElement} [errorMessage]
 * @property {HTMLElement} liveRegion
 * @property {HTMLScriptElement} [variantsData]
 * @property {HTMLTemplateElement} [moneyFormat]
 *
 * @extends {Component<FrequentlyBoughtTogetherRefs>}
 */
class FrequentlyBoughtTogetherComponent extends Component {
  requiredRefs = ['rowList', 'totalPrice', 'addToCartButton', 'liveRegion'];

  /** @type {Array<{id: number, available: boolean, options: string[], price: number}>} */
  #variants = [];

  /** @type {{id: number | null, price: number, available: boolean}} */
  #mainVariant = { id: null, price: 0, available: true };

  /**
   * How many units of the main product to add — normally 1, but synced to match
   * whatever Bundle Selector tier is currently selected (e.g. 3 for "Buy 3"), so the
   * displayed price and the actual cart contents always agree.
   * @type {number}
   */
  #mainQuantity = 1;

  #abortController = new AbortController();

  /** @type {AbortController | null} */
  #recommendationsFetch = null;

  connectedCallback() {
    super.connectedCallback();
    this.#parseVariants();
    this.#resolveInitialMainVariant();
    // Bundle Selector's default-selected tier doesn't fire a change event on page
    // load (only real user interaction does) — sync proactively so a tier other
    // than 1-unit that's selected by default is reflected from the first paint.
    this.#applyBundleTierSync(document.querySelector('bundle-selector-component'));

    // Listened at the document level, not the closest .shopify-section — this
    // component is now a standalone section, so the product's own variant picker
    // (if present on the page at all) very likely lives in a different, sibling
    // section, not an ancestor of this one.
    document.addEventListener(StandardEvents.productSelect, this.#onProductSelect, {
      signal: this.#abortController.signal,
    });

    // Bundle Selector (buy-buttons.liquid) doesn't change the underlying variant when
    // a tier is switched — only the displayed per-unit price (bundle discount). Sync
    // that so "this product"'s row matches what the customer sees in Bundle Selector.
    document.addEventListener(ThemeEvents.bundleTierChange, this.#onBundleTierChange, {
      signal: this.#abortController.signal,
    });

    if (this.dataset.manualOverride === 'false') {
      this.#loadAutomaticRecommendations();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#abortController.abort();
    this.#recommendationsFetch?.abort();
  }

  /**
   * Parses the embedded product variants JSON once on connect (used to resolve the
   * main product's variant after the page's variant picker changes selection).
   */
  #parseVariants() {
    try {
      this.#variants = JSON.parse(this.refs.variantsData?.textContent || '[]');
    } catch (error) {
      console.error('[frequently-bought-together] Failed to parse variant data:', error);
      this.#variants = [];
    }
  }

  /**
   * Reads the main product's initially-selected variant straight from the
   * server-rendered price element, rather than guessing from the variants array —
   * this correctly reflects deep links like `?variant=123`.
   */
  #resolveInitialMainVariant() {
    const priceEl = this.refs.mainProductPrice;
    this.#mainVariant = {
      id: Number(priceEl?.dataset.variantId) || null,
      price: Number(priceEl?.dataset.price) || 0,
      available: true,
    };
  }

  /**
   * When the page's native variant picker selects a new variant, resolve the matching
   * variant for the main product and refresh its displayed price + the total.
   * @param {import('@shopify/events').ProductSelectEvent} event
   */
  #onProductSelect = async (event) => {
    // Listening at the document level means this can fire for a variant picker
    // belonging to a completely different product (e.g. this section was added
    // to a page unrelated to the product it's configured for). Only react when
    // the event is actually about our own product.
    if (String(event.product?.id ?? '') !== String(this.dataset.productId ?? '')) return;

    try {
      const { detail } = await event.promise;
      const options = detail?.resource?.options;
      if (!Array.isArray(options) || options.length === 0) return;

      const match = this.#variants.find((variant) => {
        const variantOptions = variant.options || [];
        return (
          variantOptions.length === options.length &&
          variantOptions.every((value, index) => value === options[index])
        );
      });

      if (!match) return;

      this.#mainVariant = { id: match.id, price: match.price, available: match.available };
      this.#updateMainPriceDisplay();
      this.#recalculateTotal();
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.warn('[frequently-bought-together] productSelect sync failed:', error);
      }
    }
  };

  /**
   * When a Bundle Selector tier is switched, sync both "this product"'s per-unit price
   * and the quantity to add to the newly selected tier (`data-per-unit-price` /
   * `data-unit-count` on the checked tier radio, set by `blocks/bundle-tier.liquid`).
   * The variant id itself doesn't change — a tier switch only changes quantity/discount,
   * not which variant is selected.
   * @param {Event} event
   */
  #onBundleTierChange = (event) => {
    this.#applyBundleTierSync(/** @type {Element} */ (event.target));
  };

  /**
   * @param {Element | null} [bundleSelectorEl]
   */
  #applyBundleTierSync(bundleSelectorEl) {
    const checkedRadio = bundleSelectorEl?.querySelector('.bundle-tier__radio:checked');
    const perUnitPrice = Number(/** @type {HTMLElement | null} */ (checkedRadio)?.dataset.perUnitPrice);
    const unitCount = Number(/** @type {HTMLElement | null} */ (checkedRadio)?.dataset.unitCount);
    if (!checkedRadio || Number.isNaN(perUnitPrice) || !unitCount) return;

    this.#mainVariant = { ...this.#mainVariant, price: perUnitPrice };
    this.#mainQuantity = unitCount;
    this.#updateMainPriceDisplay();
    this.#recalculateTotal();
  }

  /**
   * Only updates the data attributes that back price calculations — there's no visible
   * per-item price text anymore, just the thumbnail image.
   */
  #updateMainPriceDisplay() {
    const { mainProductPrice } = this.refs;
    if (!mainProductPrice) return;

    mainProductPrice.dataset.price = String(this.#mainVariant.price);
    if (this.#mainVariant.id) {
      mainProductPrice.dataset.variantId = String(this.#mainVariant.id);
    }
  }

  #recalculateTotal() {
    let total = this.#mainVariant.price * this.#mainQuantity;

    for (const row of this.#getComplementaryRows()) {
      total += Number(row.dataset.price) || 0;
    }

    this.refs.totalPrice.textContent = this.#formatPrice(total);
  }

  /**
   * Queries complementary rows directly from the DOM rather than through `this.refs` —
   * refs update asynchronously (mutation observer), so reading them immediately after
   * inserting the automatic-mode rows can return a stale, empty list. A direct query is
   * always current.
   * @returns {HTMLElement[]}
   */
  #getComplementaryRows() {
    return Array.from(
      this.querySelectorAll('.frequently-bought-together__row:not(.frequently-bought-together__row--main)')
    );
  }

  /**
   * @param {number} price
   * @returns {string}
   */
  #formatPrice(price) {
    const format = this.refs.moneyFormat?.content?.textContent?.trim() || '{{amount}}';
    return formatMoney(price, format, this.dataset.currency || '');
  }

  /**
   * Fetches Shopify's native complementary product recommendations and renders them,
   * only used when the merchant has not configured a manual product override.
   * Endpoint returns JSON (no `section_id` param), per Shopify's Product
   * Recommendations AJAX API — https://shopify.dev/docs/api/ajax/reference/product-recommendations
   */
  async #loadAutomaticRecommendations() {
    const { productId, recommendationsUrl } = this.dataset;
    if (!productId || !recommendationsUrl) {
      this.hidden = true;
      return;
    }

    this.#recommendationsFetch = new AbortController();

    try {
      const url = `${recommendationsUrl}?product_id=${productId}&intent=complementary&limit=3`;
      const response = await fetch(url, {
        signal: this.#recommendationsFetch.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) throw new Error(`Recommendations request failed: ${response.status}`);

      const data = await response.json();
      /** @type {Array<any>} */
      const products = Array.isArray(data?.products) ? data.products : [];
      const available = products.filter((product) => product.available).slice(0, 3);

      if (available.length === 0) {
        this.hidden = true;
        return;
      }

      this.#renderComplementaryRows(available);
      this.classList.remove('frequently-bought-together--loading');
      this.#recalculateTotal();
    } catch (error) {
      if (/** @type {any} */ (error)?.name === 'AbortError') return;
      console.error('[frequently-bought-together] Failed to load recommendations:', error);
      this.hidden = true;
    }
  }

  /**
   * Builds and appends complementary product thumbnails (+ separators) from the
   * recommendations JSON response. Mirrors the server-rendered row structure from the
   * Liquid template.
   * @param {Array<any>} products
   */
  #renderComplementaryRows(products) {
    const { rowList, skeleton } = this.refs;

    for (const product of products) {
      const variant = Array.isArray(product.variants) ? product.variants[0] : null;
      if (!variant) continue;

      const price = variant.price ?? product.price ?? 0;
      const imageSrc = this.#resolveImageSrc(product);
      const title = product.title || '';

      const plus = document.createElement('span');
      plus.className = 'frequently-bought-together__plus';
      plus.setAttribute('aria-hidden', 'true');
      plus.textContent = '+';

      const row = document.createElement('div');
      row.className = 'frequently-bought-together__row';
      row.dataset.price = String(price);
      row.dataset.variantId = String(variant.id ?? '');

      const thumbnail = document.createElement('span');
      thumbnail.className = 'frequently-bought-together__thumbnail';
      if (imageSrc) {
        const img = document.createElement('img');
        img.src = imageSrc;
        img.width = 64;
        img.height = 64;
        img.loading = 'lazy';
        img.alt = title;
        img.className = 'frequently-bought-together__thumbnail-image';
        thumbnail.append(img);
      }

      row.append(thumbnail);
      rowList.insertBefore(plus, skeleton ?? null);
      rowList.insertBefore(row, skeleton ?? null);
    }
  }

  /**
   * The recommendations JSON's image fields aren't yet confirmed against a live
   * response on this store (see implementation plan risk) — handles both a plain
   * string URL and a `{ src }` object defensively.
   * @param {any} product
   * @returns {string | null}
   */
  #resolveImageSrc(product) {
    if (typeof product.featured_image === 'string') return product.featured_image;

    const first = Array.isArray(product.images) ? product.images[0] : null;
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && typeof first.src === 'string') return first.src;

    return null;
  }

  /**
   * Gathers the main product's resolved variant + every complementary product shown
   * (no per-item selection) and submits them as one multi-item add-to-cart request.
   */
  addToCart() {
    this.#clearError();

    if (!this.#mainVariant.id) {
      this.#showError(this.dataset.unavailableText || '');
      return;
    }

    /** @type {Array<{id: number, quantity: number}>} */
    const items = [{ id: this.#mainVariant.id, quantity: this.#mainQuantity }];

    for (const row of this.#getComplementaryRows()) {
      const variantId = Number(row.dataset.variantId);
      if (variantId) items.push({ id: variantId, quantity: 1 });
    }

    this.#submitItems(items);
  }

  /**
   * @param {Array<{id: number, quantity: number}>} items
   */
  #submitItems(items) {
    const { addToCartButton } = this.refs;
    addToCartButton.setAttribute('aria-disabled', 'true');
    addToCartButton.disabled = true;

    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    const sectionIds = /** @type {string[]} */ ([]);
    cartItemsComponents.forEach((item) => {
      if (item instanceof HTMLElement && item.dataset.sectionId) sectionIds.push(item.dataset.sectionId);
    });

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const deferredEventPromise = CartLinesUpdateEvent.createPromise();

    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'add',
        context: 'frequently-bought-together',
        lines: items.map((item) => ({ merchandiseId: String(item.id), quantity: item.quantity })),
        promise: deferredEventPromise.promise,
      })
    );

    const payload = { items, sections: sectionIds.join(',') };
    const fetchCfg = fetchConfig('json', { body: JSON.stringify(payload) });

    fetch(Theme.routes.cart_add_url, fetchCfg)
      .then((response) => response.json())
      .then(async (response) => {
        if (response.status) {
          this.#showError(response.message || this.dataset.errorText || '');

          this.dispatchEvent(
            new CartErrorEvent({
              error: response.message || 'Add to cart failed',
              code: 'INVALID',
              detail: { description: response.description, errors: response.errors },
            })
          );

          deferredEventPromise.reject(new Error(response.message || 'Add to cart failed'));
          return;
        }

        this.#setLiveRegionText(this.dataset.addedText || '');

        const cart = await this.#refreshCart();
        deferredEventPromise.resolve({
          cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
          detail: {
            items: cart.items,
            source: 'frequently-bought-together-component',
            sourceId: this.id || '',
            itemCount: totalQuantity,
            sections: response.sections,
            didError: false,
          },
        });
      })
      .catch((error) => {
        console.error('[frequently-bought-together] Add to cart failed:', error);
        this.#showError(this.dataset.errorText || '');
        deferredEventPromise.reject(error);

        this.dispatchEvent(
          new CartErrorEvent({
            error: error?.message || 'Network error during add to cart',
            code: 'SERVICE_UNAVAILABLE',
          })
        );
      })
      .finally(() => {
        addToCartButton.removeAttribute('aria-disabled');
        addToCartButton.disabled = false;
      });
  }

  #refreshCart() {
    const cartItemsComponent = document.querySelector('cart-items-component');

    if (cartItemsComponent) {
      return customElements
        .whenDefined('cart-items-component')
        .then(() => /** @type {any} */ (cartItemsComponent).fetchCartData());
    }

    return fetch(`${Theme.routes.cart_url}.json`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    }).then((response) => {
      if (!response.ok) throw new Error(`Failed to fetch cart: ${response.status}`);
      return response.json();
    });
  }

  /** @param {string} message */
  #showError(message) {
    const { errorMessage } = this.refs;
    if (!errorMessage || !message) return;

    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    this.#setLiveRegionText(message);
  }

  #clearError() {
    const { errorMessage } = this.refs;
    if (!errorMessage) return;

    errorMessage.classList.add('hidden');
    errorMessage.textContent = '';
  }

  /** @param {string} text */
  #setLiveRegionText(text) {
    this.refs.liveRegion.textContent = text;
  }
}

if (!customElements.get('frequently-bought-together-component')) {
  customElements.define('frequently-bought-together-component', FrequentlyBoughtTogetherComponent);
}
