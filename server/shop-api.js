import express from 'express';
import { openShop, ShopError } from './shop.js';

export function shopApi(options) {
  const api = express();
  api.disable('x-powered-by');
  let storePromise;
  const store = () => storePromise ??= openShop(options).catch(error => {
    storePromise = undefined;
    throw error;
  });
  api.use('/api/shop', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  api.get('/api/shop/status', async (_request, response) => {
    response.json({ live: (await store()).live });
  });
  api.post('/api/shop/orders', express.json({ limit: '8kb' }), async (request, response) => {
    if (!request.is('application/json')) throw new ShopError('Použijte objednávkový formulář.', 415);
    const shop = await store();
    const order = shop.place(request.body);
    response.status(201).json(order);
    void shop.deliver().catch(error => console.error('Frontu e-mailů se nepodařilo zpracovat:', error.code ?? error.name));
  });
  api.use('/api/shop', (error, _request, response, _next) => {
    if (error instanceof ShopError) return response.status(error.status).json({ error: error.message });
    if (error.status === 413 || error.status === 400) {
      return response.status(error.status).json({ error: 'Údaje objednávky se nepodařilo načíst.' });
    }
    console.error('Obchod: objednávková služba není dostupná.', error.code ?? error.name);
    return response.status(503).json({ error: 'Obchod je dočasně nedostupný. Zkuste to prosím později.' });
  });
  return api;
}
