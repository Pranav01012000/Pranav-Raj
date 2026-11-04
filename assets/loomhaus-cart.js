/* Loomhaus cart core: Cart AJAX API + auto-add rule.
   Errors are now thrown to the caller, so the UI can show them. */
const LoomCart = (() => {
  // Soft Winter Jacket (M / Black) variant id, rendered by the cart drawer section
  const autoVariantId = () =>
    Number(document.querySelector('[data-cart-drawer]')?.dataset.autoVariantId) || 0;

  // POST helper: throws a readable error when Shopify rejects the request (422 etc.)
  async function post(url, body) {
    const res = await fetch(window.Shopify.routes.root + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.description || data.message || 'Cart request failed');
    return data;
  }

  const getCart = () => fetch(window.Shopify.routes.root + 'cart.js').then((r) => r.json());

  // Hidden property ("_" prefix is not shown at checkout) marks the auto-added line
  const isAuto = (item) => !!item.properties && item.properties._auto_added === 'true';

  // A Black + M line (the auto-added jacket itself never counts as a trigger)
  const isTrigger = (item) => {
    if (isAuto(item) || item.variant_id === autoVariantId()) return false;
    const values = item.options_with_values.map((o) => o.value.trim().toLowerCase());
    return values.includes('black') && values.includes('m');
  };

  // Run cart operations one at a time to avoid race conditions.
  // The queue survives a failure, but the caller still receives the error.
  let queue = Promise.resolve();
  const enqueue = (fn) => {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  };

  // Enforce the special rule after every change
  async function sync() {
    const cart = await getCart();
    const hasTrigger = cart.items.some(isTrigger);
    const autoLine = cart.items.find(isAuto);

    if (hasTrigger && !autoLine && autoVariantId()) {
      try {
        await post('cart/add.js', {
          items: [{ id: autoVariantId(), quantity: 1, properties: { _auto_added: 'true' } }],
        });
      } catch (err) {
        console.warn('Auto-add failed (check variant stock):', err.message);
      }
    } else if (!hasTrigger && autoLine) {
      await post('cart/change.js', { id: autoLine.key, quantity: 0 });
    } else if (autoLine && autoLine.quantity !== 1) {
      await post('cart/change.js', { id: autoLine.key, quantity: 1 }); // quantity is locked
    }
    return getCart();
  }

  const emit = (cart, open = false) =>
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart, open } }));

  /* ---------- Public API ---------- */
//   const add = (variantId, quantity = 1) =>
//     enqueue(async () => {
//       await post('cart/add.js', { items: [{ id: Number(variantId), quantity }] });
//       emit(await sync(), true); // open the drawer after adding
//     });

const add = (variantId, quantity = 1, open = true) =>
  enqueue(async () => {
    await post('cart/add.js', { items: [{ id: Number(variantId), quantity }] });
    emit(await sync(), open);
  });
  
  const change = (key, quantity) =>
    enqueue(async () => {
      await post('cart/change.js', { id: key, quantity });
      emit(await sync());
    });

  const refresh = () => enqueue(async () => emit(await getCart()));

  return { add, change, remove: (key) => change(key, 0), refresh, isAuto };
})();

document.addEventListener('DOMContentLoaded', () => LoomCart.refresh());

// Header cart count: updates without a reload (cart is null when only opening the drawer)
document.addEventListener('cart:updated', (e) => {
  if (!e.detail.cart) return;
  const count = e.detail.cart.item_count;
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = count;
    el.hidden = count === 0;
  });
});

// Cart icon click opens the drawer
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-cart-open]')) {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart: null, open: true } }));
  }
});