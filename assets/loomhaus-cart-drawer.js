/* Loomhaus cart drawer: renders the cart and handles qty / remove / close.
   All cart changes go through LoomCart (loomhaus-cart.js), so no page reload. */
(() => {
  const drawer = document.querySelector('[data-cart-drawer]');
  if (!drawer) return;

  const itemsEl = drawer.querySelector('[data-drawer-items]');
  const countEl = drawer.querySelector('[data-drawer-count]');
  const subtotalEl = drawer.querySelector('[data-drawer-subtotal]');
  let lastFocus = null;

  // Escape user-controlled strings before putting them in innerHTML
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Cart JSON prices are in cents
  const money = (cents, currency) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(cents / 100);

  const open = () => {
    lastFocus = document.activeElement;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    drawer.querySelector('.lh-drawer__close').focus();
  };

  const close = () => {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  };

  // Build the markup for the whole cart
  function render(cart) {
    countEl.textContent = cart.item_count;
    subtotalEl.textContent = money(cart.total_price, cart.currency);

    if (!cart.items.length) {
      itemsEl.innerHTML = '<p class="lh-drawer__empty">Your cart is empty.</p>';
      return;
    }

    itemsEl.innerHTML = cart.items.map((item) => {
      const auto = LoomCart.isAuto(item);
      const variant = item.variant_title && item.variant_title !== 'Default Title' ? item.variant_title : '';
      // The auto-added item has a locked quantity, so its buttons are disabled
      const lock = auto ? 'disabled' : '';
      return `
        <article class="lh-line${auto ? ' is-auto' : ''}" data-key="${esc(item.key)}">
          <img class="lh-line__img" src="${esc(item.image || '')}" alt="${esc(item.product_title)}" width="72" height="88" loading="lazy">
          <div class="lh-line__info">
            ${auto ? '<span class="lh-line__tag">Auto-added</span>' : ''}
            <p class="lh-line__title">${esc(item.product_title)}</p>
            <p class="lh-line__variant">${esc(variant)}</p>
            <div class="lh-line__actions">
              <div class="lh-qty">
                <button type="button" data-qty="-1" ${lock} aria-label="Decrease quantity">&minus;</button>
                <span>${item.quantity}</span>
                <button type="button" data-qty="1" ${lock} aria-label="Increase quantity">+</button>
              </div>
              <button type="button" class="lh-line__remove" data-remove>Remove</button>
            </div>
          </div>
          <span class="lh-line__price">${money(item.final_line_price, cart.currency)}</span>
        </article>`;
    }).join('');
  }

  // Fired by LoomCart after every change. detail.open = true opens the drawer.
  document.addEventListener('cart:updated', async (e) => {
    const cart = e.detail.cart || (await fetch(Shopify.routes.root + 'cart.js').then((r) => r.json()));
    render(cart);
    if (e.detail.open) open();
  });

  // One delegated listener for close, quantity and remove
  drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-drawer-close]')) return close();

    const line = e.target.closest('.lh-line');
    if (!line) return;
    const key = line.dataset.key;

    const qtyBtn = e.target.closest('[data-qty]');
    if (qtyBtn) {
      const current = Number(line.querySelector('.lh-qty span').textContent);
      LoomCart.change(key, current + Number(qtyBtn.dataset.qty)); // 0 removes the line
    }
    if (e.target.closest('[data-remove]')) LoomCart.remove(key);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) close();
  });
})();