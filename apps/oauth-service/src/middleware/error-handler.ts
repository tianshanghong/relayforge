import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { OAuthError } from '../utils/errors.js';

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

  // Handle standard Error objects with specific messages
  if (error instanceof Error) {
    // Map specific error messages to status codes
    if (error.message === 'User ID is required') {
      return reply.status(400).send({
        error: error.message,
        statusCode: 400,
      });
    }
    if (error.message === 'User not found' || error.message === 'Session not found') {
      return reply.status(404).send({
        error: error.message,
        statusCode: 404,
      });
    }
    if (error.message.includes('Unauthorized')) {
      return reply.status(403).send({
        error: error.message,
        statusCode: 403,
      });
    }
    if (error.message === 'Session has expired') {
      return reply.status(401).send({
        error: error.message,
        statusCode: 401,
      });
    }
  }

  // Default error response
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? 'Internal Server Error' : error.message;

  return reply.status(statusCode).send({
    error: 'SERVER_ERROR',
    message,
  });
}