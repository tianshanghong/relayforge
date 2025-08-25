import type { FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'crypto';

/**
 * Validates internal API key for service-to-service communication
 */
export async function validateInternalApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers['authorization'] as string;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header'
    });
    return;
  }

  const apiKey = authHeader.substring(7); // Remove "Bearer " prefix
  const validApiKey = process.env.INTERNAL_API_KEY;
  
  if (!validApiKey) {
    request.log.error('INTERNAL_API_KEY not configured in environment');
    reply.code(503).send({
      error: 'Service Unavailable',
      message: 'Internal API not configured'
    });
    return;
  }

  // Timing-safe comparison to prevent timing attacks
  const keyBuffer = Buffer.from(apiKey);
  const validKeyBuffer = Buffer.from(validApiKey);
  
  // Keys must be same length for timingSafeEqual
  if (keyBuffer.length !== validKeyBuffer.length) {
    reply.code(403).send({
      error: 'Forbidden',
      message: 'Invalid API key'
    });
    return;
  }

  const isValid = timingSafeEqual(keyBuffer, validKeyBuffer);
  
  if (!isValid) {
    request.log.warn({ apiKeyPrefix: apiKey.substring(0, 8) }, 'Invalid internal API key attempt');
    reply.code(403).send({
      error: 'Forbidden',
      message: 'Invalid API key'
    });
    return;
  }

  // API key is valid, continue with request
}