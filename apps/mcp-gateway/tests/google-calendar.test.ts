import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleCalendarCompleteServer } from '../src/servers/google-calendar-complete';

// Mock calendar instance
const mockEvents = {
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
};

const mockCalendar = {
  events: mockEvents,
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

describe('GoogleCalendarCompleteServer', () => {
  let server: GoogleCalendarCompleteServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new GoogleCalendarCompleteServer();
  });

  describe('tools/list', () => {
    it('should return all available tools', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      };

      const response = await server.handleRequest(request);

      expect(response.result.tools).toHaveLength(5);
      expect(response.result.tools.map((t: any) => t.name)).toEqual([
        'google-calendar.create-event',
        'google-calendar.update-event',
        'google-calendar.delete-event',
        'google-calendar.get-event',
        'google-calendar.list-events',
      ]);
    });
  });

  describe('Authentication', () => {
    it('should return error when not authenticated', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.list-events',
        params: {},
      };

      const response = await server.handleRequest(request);

      expect(response.error).toEqual({
        code: -32002,
        message: 'Google Calendar not authenticated',
      });
    });

    it('should set access token and authenticate', () => {
      const mockToken = 'test-access-token';
      
      expect(() => server.setAccessToken(mockToken)).not.toThrow();
      
      // Verify the server can handle requests after authentication
      expect(server).toBeDefined();
    });
  });

  describe('google-calendar.create-event', () => {
    beforeEach(() => {
      server.setAccessToken('test-token');
    });

    it('should create an event successfully', async () => {
      const mockEvent = {
        id: 'event-123',
        summary: 'Test Meeting',
        htmlLink: 'https://calendar.google.com/event/123',
        status: 'confirmed',
      };

      mockEvents.insert.mockResolvedValue({ data: mockEvent });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.create-event',
        params: {
          summary: 'Test Meeting',
          description: 'Test description',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
          location: 'Conference Room A',
          attendees: ['user1@example.com', 'user2@example.com'],
        },
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeUndefined();
      expect(response.result.content[0].text).toContain('Event created successfully');
      expect(response.result.content[0].text).toContain('event-123');
      expect(mockEvents.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        requestBody: expect.objectContaining({
          summary: 'Test Meeting',
          description: 'Test description',
          location: 'Conference Room A',
          attendees: [
            { email: 'user1@example.com' },
            { email: 'user2@example.com' },
          ],
        }),
        sendNotifications: true,
      });
    });

    it('should validate required fields', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.create-event',
        params: {
          description: 'Missing required fields',
        },
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32602);
      expect(response.error.message).toContain('Invalid parameters');
    });

    it('should validate date formats', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.create-event',
        params: {
          summary: 'Test Meeting',
          startTime: 'invalid-date',
          endTime: '2024-01-15T11:00:00Z',
        },
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32602);
      expect(response.error.message).toContain('Invalid start time format');
    });
  });

  describe('google-calendar.update-event', () => {
    beforeEach(() => {
      server.setAccessToken('test-token');
    });

    it('should update an event successfully', async () => {
      const existingEvent = {
        id: 'event-123',
        summary: 'Old Meeting',
        description: 'Old description',
        start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
      };

      const updatedEvent = {
        ...existingEvent,
        summary: 'Updated Meeting',
      };

      mockEvents.get.mockResolvedValue({ data: existingEvent });
      mockEvents.update.mockResolvedValue({ data: updatedEvent });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.update-event',
        params: {
          eventId: 'event-123',
          summary: 'Updated Meeting',
        },
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeUndefined();
      expect(response.result.content[0].text).toContain('Event updated successfully');
      expect(mockEvents.get).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
      });
      expect(mockEvents.update).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
        requestBody: expect.objectContaining({
          summary: 'Updated Meeting',
        }),
        sendNotifications: true,
      });
    });

    it('should return error for non-existent event', async () => {
      mockEvents.get.mockResolvedValue({ data: null });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.update-event',
        params: {
          eventId: 'non-existent',
          summary: 'Updated Meeting',
        },
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32000);
      expect(response.error.message).toBe('Event not found');
    });
  });

  describe('google-calendar.delete-event', () => {
    beforeEach(() => {
      server.setAccessToken('test-token');
    });

    it('should delete an event successfully', async () => {
      mockEvents.delete.mockResolvedValue({});

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.delete-event',
        params: {
          eventId: 'event-123',
          sendNotifications: false,
        },
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeUndefined();
      expect(response.result.content[0].text).toContain('Event deleted successfully');
      expect(mockEvents.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
        sendNotifications: false,
      });
    });
  });

  describe('google-calendar.get-event', () => {
    beforeEach(() => {
      server.setAccessToken('test-token');
    });

    it('should get event details successfully', async () => {
      const mockEvent = {
        id: 'event-123',
        summary: 'Test Meeting',
        description: 'Test description',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' },
        htmlLink: 'https://calendar.google.com/event/123',
        status: 'confirmed',
      };

      mockEvents.get.mockResolvedValue({ data: mockEvent });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.get-event',
        params: {
          eventId: 'event-123',
        },
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeUndefined();
      expect(response.result.content[0].text).toContain('Event details');
      expect(response.result.content[0].text).toContain('event-123');
      expect(response.result.content[0].text).toContain('Test Meeting');
    });
  });

  describe('google-calendar.list-events', () => {
    beforeEach(() => {
      server.setAccessToken('test-token');
    });

    it('should list events successfully', async () => {
      const mockEventsList = [
        {
          id: 'event-1',
          summary: 'Meeting 1',
          start: { dateTime: '2024-01-15T10:00:00Z' },
          end: { dateTime: '2024-01-15T11:00:00Z' },
          htmlLink: 'https://calendar.google.com/event/1',
        },
        {
          id: 'event-2',
          summary: 'Meeting 2',
          start: { dateTime: '2024-01-15T14:00:00Z' },
          end: { dateTime: '2024-01-15T15:00:00Z' },
          htmlLink: 'https://calendar.google.com/event/2',
        },
      ];

      mockEvents.list.mockResolvedValue({ data: { items: mockEventsList } });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.list-events',
        params: {
          maxResults: 10,
          timeMin: '2024-01-15T00:00:00Z',
          timeMax: '2024-01-16T00:00:00Z',
        },
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeUndefined();
      expect(response.result.content[0].text).toContain('Found 2 events');
      expect(response.result.content[0].text).toContain('Meeting 1');
      expect(response.result.content[0].text).toContain('Meeting 2');
      expect(mockEvents.list).toHaveBeenCalledWith({
        calendarId: 'primary',
        maxResults: 10,
        timeMin: '2024-01-15T00:00:00Z',
        timeMax: '2024-01-16T00:00:00Z',
        singleEvents: true,
        orderBy: 'startTime',
        q: undefined,
        showDeleted: false,
      });
    });

    it('should handle empty results', async () => {
      mockEvents.list.mockResolvedValue({ data: { items: [] } });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.list-events',
        params: {},
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeUndefined();
      expect(response.result.content[0].text).toBe('No events found');
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      server.setAccessToken('test-token');
    });

    it('should handle Google API errors', async () => {
      const apiError = {
        response: {
          data: {
            error: {
              message: 'The requested identifier already exists.',
            },
          },
        },
      };

      mockEvents.insert.mockRejectedValue(apiError);

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.create-event',
        params: {
          summary: 'Test Meeting',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
        },
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32000);
      expect(response.error.message).toContain('Google Calendar API error');
      expect(response.error.message).toContain('already exists');
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Request had invalid authentication credentials');
      mockEvents.list.mockRejectedValue(authError);

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.list-events',
        params: {},
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32002);
      expect(response.error.message).toContain('Authentication failed');
    });

    it('should handle unknown methods', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.unknown-method',
        params: {},
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32601);
      expect(response.error.message).toContain('Method not found');
    });
  });
});