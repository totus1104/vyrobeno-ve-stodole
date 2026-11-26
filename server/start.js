import express from 'express';
import { fileURLToPath } from 'node:url';
import { shopApi } from './shop-api.js';

const app = express();
app.disable('x-powered-by');
app.use(shopApi());
app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
app.listen(Number(process.env.PORT || 4173), process.env.SHOP_HOST || '127.0.0.1', () => {
  console.log('Web s objednávkovým API je spuštěný.');
});
