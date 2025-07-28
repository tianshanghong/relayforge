import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from './routes/auth.routes';
import { accountRoutes } from './routes/account.routes';
import { config } from './config';
import { errorHandler } from './middleware/error-handler';

async function start() {
  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Register plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  await fastify.register(cors, {
    origin: config.ALLOWED_ORIGINS,
    credentials: true,
  });

  await fastify.register(cookie, {
    secret: config.COOKIE_SECRET,
    parseOptions: {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    },
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
  });

  // Set error handler
  fastify.setErrorHandler(errorHandler);

  // Register routes
  await fastify.register(authRoutes, { prefix: '/oauth' });
  await fastify.register(accountRoutes, { prefix: '/api/account' });

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Start server
  try {
    await fastify.listen({
      port: config.PORT,
      host: '0.0.0.0',
    });
    fastify.log.info(`OAuth service listening on port ${config.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();