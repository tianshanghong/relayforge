import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { OAuthError } from '../utils/errors';

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  request.log.error(error);

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request parameters',
      details: error.errors,
    });
  }

  // Handle OAuth errors
  if (error instanceof OAuthError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
      provider: error.provider,
    });
  }

  // Handle rate limit errors
  if (error.statusCode === 429) {
    return reply.status(429).send({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    });
  }

  // Default error response
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? 'Internal Server Error' : error.message;

  return reply.status(statusCode).send({
    error: 'SERVER_ERROR',
    message,
  });
}