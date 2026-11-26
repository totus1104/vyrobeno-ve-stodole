let catalog;
try {
  const response = await fetch(new URL('./katalog.json', window.location.href), {
    cache: 'no-cache',
    signal: AbortSignal.timeout(5000),
  });
  if (response.ok) catalog = await response.json();
} catch {
  // Keep the rest of the site usable when the catalog cannot be loaded.
}

export const products = Array.isArray(catalog?.products) ? catalog.products : [];
export const catalogReady = products.length > 0 && catalog?.catalogReady === true;
export const maxQuantity = catalog?.maxQuantity ?? 20;
export const checkoutScriptUrl = catalog?.checkoutScriptUrl || '';
export const checkoutShippingPrice = catalog?.checkoutShippingPrice ?? null;
