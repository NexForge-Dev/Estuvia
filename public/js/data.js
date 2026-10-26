// Conteúdo público com cache em memória (fontes, catálogo, lugares, bolsas).
import { api } from './api.js';

const cache = new Map();
const once = (key, url, pick) => async () => {
  if (!cache.has(key)) cache.set(key, api.get(url).then(pick).catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
};

export const getSources = once('sources', '/content/sources', (d) => d.sources);
export const getCatalog = once('catalog', '/content/catalog', (d) => d);
export const getPlaces = once('places', '/content/places', (d) => d);
export const getDocuments = once('documents', '/content/documents', (d) => d);
