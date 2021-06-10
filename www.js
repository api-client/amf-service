import express from 'express';
import compression from 'compression';
import { requiresHttpsRedirect } from './lib/Utils.js';
import { requestLogger, errorLogger, logger } from './lib/logging.js';
import ApiRoute from './api/index.js';

// const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';
const port = process.env['PORT'] ? Number(process.env['PORT']) : 8080;
const app = express();
export default app;

app.disable('etag');
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(requestLogger);
app.use(compression({
  threshold: '1B',
}));

app.get('/_ah/health', (req, res) => {
  res.status(200).send('ok');
});

app.use((req, res, next) => {
  try {
    if (requiresHttpsRedirect(req)) {
      const { host } = req.headers;
      const newUrl = `https://${host}${req.url}`;
      res.redirect(301, newUrl);
      return;
    }
  } catch (e) {
    // ...
  }
  next();
});

// API
app.use('/v1/', ApiRoute);

// Add the error logger after all middleware and routes so that
// it can log errors from the whole application. Any custom error
// handlers should go after this.
app.use(errorLogger);

let serverResolve;
export const serverStartPromise = new Promise((resolve) => {
  serverResolve = resolve;
});

const server = app.listen(port, () => {
  // @ts-ignore
  const { port } = server.address();
  logger.info(`App listening on port ${port}`);
  serverResolve();
});

export { server };
