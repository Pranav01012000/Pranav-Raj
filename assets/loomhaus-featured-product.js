/* Loomhaus featured product: gallery, variant switching, offers, quantity, cart.
   Variant data is read from the page, so changing options needs no reload. */
(() => {
  document.querySelectorAll('[data-fp]').forEach(init);

  function init(root) {
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => [...root.querySelectorAll(s)];

    const data = JSON.parse($('[data-fp-data]').textContent);
    const colorIdx = Number(root.dataset.colorPos) - 1; // -1 means "no colour option"
    const sizeIdx = Number(root.dataset.sizePos) - 1;   // -1 means "no size option"

    const current = data.variants.find((v) => v.id === data.selected);
    const state = {
      color: colorIdx >= 0 ? current.options[colorIdx] : null,
      size: sizeIdx >= 0 ? current.options[sizeIdx] : null,
      qty: 1,
    };

    // Prices are in cents
    const money = (cents) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: (window.Shopify && Shopify.currency && Shopify.currency.active) || 'INR' }).format(cents / 100);

    const findVariant = (color, size) =>
      data.variants.find((v) =>
        (colorIdx < 0 || v.options[colorIdx] === color) &&
        (sizeIdx < 0 || v.options[sizeIdx] === size)
      ) || null;

    /* ---------- Gallery ---------- */
    const mainImg = $('[data-fp-main]');
    const thumbs = $$('[data-fp-thumb]');
    let imgIndex = 0;

    // function showImage(i) {
    //   if (!thumbs.length) return;
    //   imgIndex = (i + thumbs.length) % thumbs.length; // wrap around
    //   mainImg.src = thumbs[imgIndex].dataset.full;
    //   thumbs.forEach((t, n) => t.classList.toggle('is-active', n === imgIndex));
    // }

    function showImage(i) {
        if (!thumbs.length || !mainImg) return;
        imgIndex = (i + thumbs.length) % thumbs.length; // wrap around at both ends
        mainImg.removeAttribute('srcset');              // make sure the browser uses the new src
        mainImg.src = thumbs[imgIndex].dataset.full;
        thumbs.forEach((t, n) => t.classList.toggle('is-active', n === imgIndex));
        }

    thumbs.forEach((t, i) => t.addEventListener('click', () => showImage(i)));
    $('[data-fp-prev]')?.addEventListener('click', () => showImage(imgIndex - 1));
    $('[data-fp-next]')?.addEventListener('click', () => showImage(imgIndex + 1));

    /* ---------- Update everything for the current selection ---------- */
    function update() {
      const variant = findVariant(state.color, state.size);

      // Price, compare-at price and "Save X%"
      const price = variant ? variant.price : 0;
      const compare = variant ? variant.compare : 0;
      $('[data-fp-price]').textContent = money(price);
      const compareEl = $('[data-fp-compare]');
      const saveEl = $('[data-fp-save]');
      const onSale = compare > price;
      compareEl.hidden = saveEl.hidden = !onSale;
      if (onSale) {
        compareEl.textContent = money(compare);
        saveEl.textContent = `Save ${Math.round(((compare - price) * 100) / compare)}%`;
      }

      // Offer cards: "Get it for" = selected variant price minus the offer percentage
      $$('[data-fp-offer]').forEach((card) => {
        const pct = Number(card.dataset.percent) || 0;
        card.querySelector('[data-fp-offer-price]').textContent = money(Math.round((price * (100 - pct)) / 100));
      });

      // Swatches and size pills: selected state, and disable combinations that are sold out
      $$('[data-fp-color]').forEach((b) => {
        const on = b.dataset.fpColor === state.color;
        b.classList.toggle('is-selected', on);
        b.setAttribute('aria-pressed', String(on));
      });
      const colorName = $('[data-fp-color-name]');
      if (colorName) colorName.textContent = state.color;

      $$('[data-fp-size]').forEach((b) => {
        const size = b.dataset.fpSize;
        const ok = data.variants.some((v) => v.available && (colorIdx < 0 || v.options[colorIdx] === state.color) && v.options[sizeIdx] === size);
        b.disabled = !ok;
        b.classList.toggle('is-selected', size === state.size);
      });

      // Variant image (only if the variant has one)
      if (variant && variant.imageId) {
        const i = thumbs.findIndex((t) => Number(t.dataset.imageId) === variant.imageId);
        if (i >= 0) showImage(i);
      }

      // Buttons
      const canBuy = !!(variant && variant.available);
      $('[data-fp-add]').disabled = $('[data-fp-now]').disabled = !canBuy;
      $('[data-fp-add-label]').textContent = canBuy ? 'Add to cart' : 'Sold out';
      $('[data-fp-error]').hidden = true;

      // Keep the URL in sync so the variant can be shared
      //if (variant) history.replaceState(null, '', `${location.pathname}?variant=${variant.id}`);
      // Only sync the URL on real product pages
if (variant && location.pathname.startsWith('/products/')) {
  history.replaceState(null, '', `${location.pathname}?variant=${variant.id}`);
}
    }

    /* ---------- Option clicks ---------- */
    $$('[data-fp-color]').forEach((b) =>
      b.addEventListener('click', () => {
        state.color = b.dataset.fpColor;
        // If the chosen size is sold out in the new colour, pick the first size that is available
        const ok = data.variants.some((v) => v.available && v.options[colorIdx] === state.color && v.options[sizeIdx] === state.size);
        if (!ok && sizeIdx >= 0) {
          const alt = data.variants.find((v) => v.available && v.options[colorIdx] === state.color);
          if (alt) state.size = alt.options[sizeIdx];
        }
        update();
      })
    );
    $$('[data-fp-size]').forEach((b) =>
      b.addEventListener('click', () => { state.size = b.dataset.fpSize; update(); })
    );

    /* ---------- Quantity ---------- */
    const qtyEl = $('[data-fp-qty-value]');
    $$('[data-fp-qty]').forEach((b) =>
      b.addEventListener('click', () => {
        state.qty = Math.min(99, Math.max(1, state.qty + Number(b.dataset.fpQty)));
        qtyEl.textContent = String(state.qty).padStart(2, '0');
      })
    );

    /* ---------- Add to cart and Buy it now ---------- */
    const errorEl = $('[data-fp-error]');
    const showError = (err) => { errorEl.textContent = err.message || 'Something went wrong. Please try again.'; errorEl.hidden = false; };

    $('[data-fp-add]').addEventListener('click', async (e) => {
      const variant = findVariant(state.color, state.size);
      if (!variant) return;
      e.currentTarget.disabled = true;
      try { await LoomCart.add(variant.id, state.qty); } // opens the cart drawer
      catch (err) { showError(err); }
      finally { update(); }
    });

    // Buy it now: add the variant (keeps the Black + M rule working), skip the drawer, go to checkout
    $('[data-fp-now]').addEventListener('click', async (e) => {
      const variant = findVariant(state.color, state.size);
      if (!variant) return;
      e.currentTarget.disabled = true;
      try {
        await LoomCart.add(variant.id, state.qty, false);
        window.location.href = `${Shopify.routes.root}checkout`;
      } catch (err) { showError(err); update(); }
    });

    /* ---------- Copy offer code ---------- */
    $$('[data-fp-copy]').forEach((b) =>
      b.addEventListener('click', async () => {
        const code = b.dataset.fpCopy;
        try { await navigator.clipboard.writeText(code); }
        catch {
          // Fallback for older browsers
          const t = Object.assign(document.createElement('textarea'), { value: code });
          document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
        }
        b.classList.add('is-copied');
        b.title = 'Copied!';
        setTimeout(() => { b.classList.remove('is-copied'); b.removeAttribute('title'); }, 1500);
      })
    );

    update();
  }
})();