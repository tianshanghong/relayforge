import { vi } from 'vitest';

// Set up test environment variables before any modules are loaded
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECRET = 'test-cookie-secret-32-characters-long';
process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long!!';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.SESSION_DURATION_DAYS = '30';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Mock external services to prevent actual connections during tests
vi.mock('@fastify/websocket');

// Create global mock for Google Calendar
const mockEvents = {
  insert: vi.fn(),
  update: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
};

const mockCalendarLists = {
  list: vi.fn(),
};

const mockCalendar = {
  events: mockEvents,
  calendarList: mockCalendarLists,
};

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
      })),
    },
    calendar: vi.fn().mockImplementation(() => mockCalendar),
  },
}));

// Make mocks available globally for tests
(global as any).mockGoogleCalendarEvents = mockEvents;
(global as any).mockGoogleCalendarLists = mockCalendarLists;