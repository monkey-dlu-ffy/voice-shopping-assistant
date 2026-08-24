import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, isProduction } from './config.js';
import { createApiRouter, type ApiDeps } from './routes/api.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build the Express app.
 *
 * Split out from `index.ts` so tests can mount it with a memory repository and a
 * mock intent provider without starting a listener or touching the network.
 */
export function createApp(deps: ApiDeps): Express {
  const app = express();

  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());

  // In production the API and the built frontend are the same origin, so CORS is
  // only needed for the split dev setup (Vite on 5173, API on 8080).
  if (!isProduction) {
    app.use(cors({ origin: true, credentials: true }));
  }

  app.use('/api', createApiRouter(deps));

  // Cloud Run's health check hits the root path of the service.
  app.get('/healthz', (_req, res) => {
    res.status(200).send('ok');
  });

  serveFrontend(app);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Log the full error server-side; return something safe to the client.
    console.error('[api] unhandled error:', error);
    res.status(500).json({
      error: 'Something went wrong handling that command. Please try again.',
    });
  });

  return app;
}

/**
 * Serve the built React app from the same process.
 *
 * This is what makes the single-container deployment work: one image, one port,
 * no separate static host and no CORS in production. Skipped silently when the
 * frontend has not been built, so the API alone still runs in development.
 */
function serveFrontend(app: Express): void {
  const webRoot = path.resolve(here, config.webRoot);
  if (!fs.existsSync(path.join(webRoot, 'index.html'))) {
    console.warn(`[web] no built frontend at ${webRoot} - serving API only`);
    return;
  }

  app.use(
    express.static(webRoot, {
      // Hashed asset filenames can be cached hard; index.html must not be.
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // Client-side routing: anything not under /api falls through to the SPA.
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(webRoot, 'index.html'));
  });

  console.log(`[web] serving frontend from ${webRoot}`);
}
