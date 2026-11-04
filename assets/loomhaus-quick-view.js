/* Loomhaus quick view: fetches the product by handle, renders colours and sizes,
   and adds the chosen variant through LoomCart (Cart AJAX API). */
(() => {
  const root = document.querySelector('[data-qv]');
  if (!root) return;

  const $ = (sel) => root.querySelector(sel);
  const els = {
    image: $('[data-qv-image]'),
    title: $('[data-qv-title]'),
    price: $('[data-qv-price]'),
    desc: $('[data-qv-desc]'),
    colorGroup: $('[data-qv-color-group]'),
    colors: $('[data-qv-colors]'),
    sizeGroup: $('[data-qv-size-group]'),
    size: $('[data-qv-size]'),
    error: $('[data-qv-error]'),
    add: $('[data-qv-add]'),
    addLabel: $('[data-qv-add-label]'),
  };

  const cache = new Map();          // handle -> product JSON, so reopening is instant
  let product = null;
  let idx = { color: -1, size: -1 }; // which option position (0, 1, 2) is colour / size
  let selected = { color: null, size: '' };
  let lastFocus = null;

  /* ---------- Helpers ---------- */

  // Product JSON prices are in cents
  const money = (cents) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: (window.Shopify && Shopify.currency && Shopify.currency.active) || 'INR',
    }).format(cents / 100);

  // Description arrives as HTML: convert to plain text without injecting it
  const toText = (html) => new DOMParser().parseFromString(html || '', 'text/html').body.textContent.trim();

  // Option names can be strings or objects depending on the response shape
  const optionName = (o) => (typeof o === 'string' ? o : o.name);

  // Unique values of one option position, taken from the variants
  const valuesFor = (pos) => [...new Set(product.variants.map((v) => v['option' + (pos + 1)]))];

  // Find the variant for the current selection (null if incomplete)
  const findVariant = () =>
    product.variants.find((v) =>
      (idx.color < 0 || v['option' + (idx.color + 1)] === selected.color) &&
      (idx.size < 0 || v['option' + (idx.size + 1)] === selected.size)
    ) || null;

  // Is there any purchasable variant for this colour + size?
  const sizeAvailable = (size) =>
    product.variants.some((v) =>
      v.available &&
      (idx.color < 0 || v['option' + (idx.color + 1)] === selected.color) &&
      v['option' + (idx.size + 1)] === size
    );

  /* ---------- Render ---------- */

  function renderColors() {
    els.colors.replaceChildren();
    valuesFor(idx.color).forEach((value) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lh-qv__color' + (value === selected.color ? ' is-selected' : '');
      btn.setAttribute('aria-pressed', String(value === selected.color));

      const dot = document.createElement('span');
      dot.className = 'lh-qv__dot';
      dot.style.setProperty('--swatch', value.toLowerCase().replace(/\s+/g, '')); // "Black" -> black
      const label = document.createElement('span');
      label.textContent = value;

      btn.append(dot, label);
      btn.addEventListener('click', () => {
        selected.color = value;
        // Keep the chosen size only if it still exists for the new colour
        if (selected.size && !sizeAvailable(selected.size)) selected.size = '';
        renderColors();
        renderSizes();
        update();
      });
      els.colors.append(btn);
    });
  }

  function renderSizes() {
    els.size.replaceChildren(new Option('Choose your size', ''));
    valuesFor(idx.size).forEach((value) => {
      const opt = new Option(sizeAvailable(value) ? value : value + ' (sold out)', value);
      opt.disabled = !sizeAvailable(value);
      els.size.append(opt);
    });
    els.size.value = selected.size;
  }

  // Refresh price, image and button state for the current selection
  function update() {
    const variant = findVariant();
    els.error.hidden = true;

    els.price.textContent = money(variant ? variant.price : product.price);

    // Variant image if it has one, otherwise the product image
    const src = (variant && variant.featured_image && variant.featured_image.src) || product.featured_image;
    if (src) { els.image.src = src; els.image.alt = product.title; }

    els.add.disabled = !(variant && variant.available);
  }

  function render(p) {
    product = p;
    const names = p.options.map(optionName);
    idx = {
      color: names.findIndex((n) => /colou?r/i.test(n)),
      size: names.findIndex((n) => /size/i.test(n)),
    };

    // Default state: first available colour, no size chosen yet
    selected = { color: idx.color >= 0 ? valuesFor(idx.color)[0] : null, size: '' };

    els.title.textContent = p.title;
    els.desc.textContent = toText(p.description);
    els.desc.hidden = !els.desc.textContent;

    els.colorGroup.hidden = idx.color < 0;
    els.sizeGroup.hidden = idx.size < 0;
    if (idx.color >= 0) renderColors();
    if (idx.size >= 0) renderSizes();
    update();
  }

  /* ---------- Open / close ---------- */

  async function open(handle, trigger) {
    lastFocus = trigger;
    try {
      if (!cache.has(handle)) {
        const res = await fetch(`${Shopify.routes.root}products/${handle}.js`);
        if (!res.ok) throw new Error('Product not found: ' + handle);
        cache.set(handle, await res.json());
      }
      render(cache.get(handle));
      root.classList.add('is-open');
      root.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      root.querySelector('.lh-qv__close').focus();
    } catch (err) {
      console.error(err);
    }
  }

  function close() {
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  /* ---------- Events ---------- */

  // Hotspot click (delegated, works for every tile)
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-quick-view]');
    if (trigger) open(trigger.dataset.productHandle, trigger);
  });

  // Close: X button, click outside the popup, or Escape
  root.addEventListener('click', (e) => { if (e.target.closest('[data-qv-close]')) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('is-open')) close();
  });

  els.size.addEventListener('change', () => { selected.size = els.size.value; update(); });

  // Add to cart: no page reload, then open the cart drawer
  els.add.addEventListener('click', async () => {
    const variant = findVariant();
    if (!variant) return;
    els.add.disabled = true;
    els.addLabel.textContent = 'Adding...';
    try {
      await LoomCart.add(variant.id, 1); // emits cart:updated with open = true
      close();
    } catch (err) {
     els.error.textContent = err.message || 'Could not add to cart. Please try again.';
      els.error.hidden = false;
    } finally {
      els.addLabel.textContent = 'Add to cart';
      update();
    }
  });
})();