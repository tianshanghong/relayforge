import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleCalendarCompleteServer } from '../src/servers/google-calendar-complete';

// Mock calendar instance
const mockEvents = {
  insert: vi.fn(),
  update: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
};

const mockCalendarList = {
  list: vi.fn(),
};

const mockCalendar = {
  events: mockEvents,
  calendarList: mockCalendarList,
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

describe('Calendar Selection Feature', () => {
  let server: GoogleCalendarCompleteServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new GoogleCalendarCompleteServer();
    server.setAccessToken('test-token');
  });

  describe('google-calendar.list-calendars', () => {
    it('should list all accessible calendars', async () => {
      const mockCalendars = [
        {
          id: 'primary',
          summary: 'Personal Calendar',
          primary: true,
          accessRole: 'owner',
          backgroundColor: '#1a73e8',
          foregroundColor: '#ffffff',
          timeZone: 'America/New_York',
          selected: true,
          hidden: false,
        },
        {
          id: 'work@company.com',
          summary: 'Work Calendar',
          primary: false,
          accessRole: 'writer',
          backgroundColor: '#0f9d58',
          foregroundColor: '#ffffff',
          timeZone: 'America/New_York',
          selected: true,
          hidden: false,
        },
        {
          id: 'shared@team.com',
          summary: 'Team Calendar',
          primary: false,
          accessRole: 'reader',
          backgroundColor: '#f4511e',
          foregroundColor: '#ffffff',
          timeZone: 'UTC',
          selected: true,
          hidden: false,
          description: 'Shared team events',
        },
      ];

      mockCalendarList.list.mockResolvedValue({
        data: { items: mockCalendars },
      });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.list-calendars',
        params: {},
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeUndefined();
      expect(response.result.content[0].text).toContain('Found 3 calendars');
      expect(response.result.content[0].text).toContain('Personal Calendar');
      expect(response.result.content[0].text).toContain('Work Calendar');
      expect(response.result.content[0].text).toContain('Team Calendar');
      expect(mockCalendarList.list).toHaveBeenCalledWith({
        showHidden: false,
        minAccessRole: undefined,
      });
    });

    it('should handle showHidden parameter', async () => {
      mockCalendarList.list.mockResolvedValue({
        data: { items: [] },
      });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.list-calendars',
        params: {
          showHidden: true,
        },
      };

      await server.handleRequest(request);

      expect(mockCalendarList.list).toHaveBeenCalledWith({
        showHidden: true,
        minAccessRole: undefined,
      });
    });

    it('should filter by minimum access role', async () => {
      mockCalendarList.list.mockResolvedValue({
        data: { items: [] },
      });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.list-calendars',
        params: {
          minAccessRole: 'writer',
        },
      };

      await server.handleRequest(request);

      expect(mockCalendarList.list).toHaveBeenCalledWith({
        showHidden: false,
        minAccessRole: 'writer',
      });
    });

    it('should handle empty calendar list', async () => {
      mockCalendarList.list.mockResolvedValue({
        data: { items: [] },
      });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.list-calendars',
        params: {},
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeUndefined();
      expect(response.result.content[0].text).toBe('No calendars found');
    });
  });

  describe('Calendar ID in CRUD operations', () => {
    it('should use specified calendarId when creating events', async () => {
      mockEvents.insert.mockResolvedValue({
        data: { id: 'event-123', summary: 'Work Meeting' },
      });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.create-event',
        params: {
          calendarId: 'work@company.com',
          summary: 'Work Meeting',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
        },
      };

      await server.handleRequest(request);

      expect(mockEvents.insert).toHaveBeenCalledWith({
        calendarId: 'work@company.com',
        requestBody: expect.any(Object),
        sendNotifications: true,
      });
    });

    it('should default to primary calendar when not specified', async () => {
      mockEvents.insert.mockResolvedValue({
        data: { id: 'event-123', summary: 'Personal Event' },
      });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.create-event',
        params: {
          summary: 'Personal Event',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
        },
      };

      await server.handleRequest(request);

      expect(mockEvents.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        requestBody: expect.any(Object),
        sendNotifications: true,
      });
    });

    it('should use specified calendarId in update operations', async () => {
      const existingEvent = {
        id: 'event-123',
        summary: 'Old Meeting',
        start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
      };

      mockEvents.get.mockResolvedValue({ data: existingEvent });
      mockEvents.patch.mockResolvedValue({ data: { ...existingEvent, summary: 'Updated Meeting' } });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.update-event',
        params: {
          eventId: 'event-123',
          calendarId: 'shared@team.com',
          summary: 'Updated Meeting',
        },
      };

      await server.handleRequest(request);

      expect(mockEvents.patch).toHaveBeenCalledWith({
        calendarId: 'shared@team.com',
        eventId: 'event-123',
        requestBody: expect.any(Object),
        sendNotifications: true,
      });
    });

    it('should use specified calendarId in delete operations', async () => {
      mockEvents.delete.mockResolvedValue({});

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar.delete-event',
        params: {
          eventId: 'event-123',
          calendarId: 'work@company.com',
        },
      };

      await server.handleRequest(request);

      expect(mockEvents.delete).toHaveBeenCalledWith({
        calendarId: 'work@company.com',
        eventId: 'event-123',
        sendNotifications: true,
      });
    });

    it('should provide helpful error when calendar not found', async () => {
      const apiError = {
        response: {
          status: 404,
          data: {
            error: {
              message: 'Calendar not found: nonexistent@calendar.com',
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
          calendarId: 'nonexistent@calendar.com',
          summary: 'Test Event',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
        },
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32000);
      expect(response.error.message).toBe('Calendar not found. Use list-calendars to see available calendars.');
    });
  });
});