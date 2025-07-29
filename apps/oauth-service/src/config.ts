import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load .env file
dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3002').transform(Number),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  
  // Security
  COOKIE_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  
  // CORS
  ALLOWED_ORIGINS: z.string().transform((val) => val.split(',')),
  
  // OAuth Providers
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_REDIRECT_URI: z.string().url(),
  
  // Optional providers (for future)
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_REDIRECT_URI: z.string().url().optional(),
  
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().url().optional(),
  
  // Frontend URL
  FRONTEND_URL: z.string().url(),
  
  // Session duration
  SESSION_DURATION_DAYS: z.string().default('30').transform(Number),
});

// Load and validate config
const env = {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  LOG_LEVEL: process.env.LOG_LEVEL,
  COOKIE_SECRET: process.env.COOKIE_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:5173',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3002/oauth/google/callback',
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  GITHUB_REDIRECT_URI: process.env.GITHUB_REDIRECT_URI,
  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
  SLACK_REDIRECT_URI: process.env.SLACK_REDIRECT_URI,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  SESSION_DURATION_DAYS: process.env.SESSION_DURATION_DAYS,
};

export const config = configSchema.parse(env);