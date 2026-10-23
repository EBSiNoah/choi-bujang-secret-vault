// Compatibility entry point for local tests and non-Vercel adapters.
// Vercel rewrites /api/notes/:id to /api/notes?id=:id so this is not deployed
// as a separate Serverless Function.
export { default } from '../notes.js';
