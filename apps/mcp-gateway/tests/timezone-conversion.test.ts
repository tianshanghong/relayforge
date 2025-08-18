import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleCalendarCompleteServer } from '../src/servers/google-calendar-complete';
import * as moment from 'moment-timezone';

// Mock calendar instance
const mockEvents = {
  get: vi.fn(),
  patch: vi.fn(),
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

describe('Timezone Conversion in Google Calendar', () => {
  let server: GoogleCalendarCompleteServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new GoogleCalendarCompleteServer();
    server.setAccessToken('test-token');
  });

  describe('Timezone-only updates', () => {
    it('should convert datetime when updating only timezone to preserve absolute time', async () => {
      // Setup: Event at 10 AM EST (15:00 UTC)
      const existingEvent = {
        id: 'event-123',
        summary: 'Team Meeting',
        start: { 
          dateTime: '2024-01-15T10:00:00-05:00', // 10 AM EST
          timeZone: 'America/New_York'
        },
        end: { 
          dateTime: '2024-01-15T11:00:00-05:00', // 11 AM EST
          timeZone: 'America/New_York'
        },
      };

      mockEvents.get.mockResolvedValue({ data: existingEvent });
      mockEvents.patch.mockResolvedValue({ 
        data: { 
          ...existingEvent,
          start: { 
            dateTime: '2024-01-16T00:00:00+09:00', // Converted to JST
            timeZone: 'Asia/Tokyo'
          },
          end: { 
            dateTime: '2024-01-16T01:00:00+09:00', // Converted to JST
            timeZone: 'Asia/Tokyo'
          },
        } 
      });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google_calendar_update_event',
        params: {
          eventId: 'event-123',
          timeZone: 'Asia/Tokyo', // Only updating timezone
        },
      };

      const response = await server.handleRequest(request);

      // Verify it fetched the existing event
      expect(mockEvents.get).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
      });

      // Verify the patch request
      expect(mockEvents.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
        requestBody: {
          start: {
            dateTime: expect.stringMatching(/2024-01-16T00:00:00\+09:00/), // 10 AM EST = 12 AM JST next day
            timeZone: 'Asia/Tokyo',
          },
          end: {
            dateTime: expect.stringMatching(/2024-01-16T01:00:00\+09:00/), // 11 AM EST = 1 AM JST next day
            timeZone: 'Asia/Tokyo',
          },
        },
        sendNotifications: true,
      });

      expect(response.error).toBeUndefined();
    });

    it('should NOT convert datetime when updating both time and timezone', async () => {
      const existingEvent = {
        id: 'event-123',
        summary: 'Team Meeting',
        start: { 
          dateTime: '2024-01-15T10:00:00-05:00',
          timeZone: 'America/New_York'
        },
        end: { 
          dateTime: '2024-01-15T11:00:00-05:00',
          timeZone: 'America/New_York'
        },
      };

      mockEvents.get.mockResolvedValue({ data: existingEvent });
      mockEvents.patch.mockResolvedValue({ data: existingEvent });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google_calendar_update_event',
        params: {
          eventId: 'event-123',
          startTime: '2024-01-15T14:00:00Z', // Explicitly setting new time
          timeZone: 'Asia/Tokyo', // And changing timezone
        },
      };

      await server.handleRequest(request);

      // Should use the provided time, not convert
      expect(mockEvents.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
        requestBody: {
          start: {
            dateTime: '2024-01-15T14:00:00Z', // Uses provided time
            timeZone: 'Asia/Tokyo',
          },
          end: {
            dateTime: '2024-01-15T11:00:00-05:00', // Keeps existing end time
            timeZone: 'Asia/Tokyo',
          },
        },
        sendNotifications: true,
      });
    });

    it('should handle UTC to other timezone conversions', async () => {
      const existingEvent = {
        id: 'event-123',
        start: { 
          dateTime: '2024-01-15T15:00:00Z', // 3 PM UTC
          timeZone: 'UTC'
        },
        end: { 
          dateTime: '2024-01-15T16:00:00Z', // 4 PM UTC
          timeZone: 'UTC'
        },
      };

      mockEvents.get.mockResolvedValue({ data: existingEvent });
      mockEvents.patch.mockResolvedValue({ data: existingEvent });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google_calendar_update_event',
        params: {
          eventId: 'event-123',
          timeZone: 'America/Los_Angeles', // PST/PDT
        },
      };

      await server.handleRequest(request);

      // Verify conversion from UTC to LA time
      expect(mockEvents.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
        requestBody: {
          start: {
            dateTime: expect.stringMatching(/2024-01-15T07:00:00-08:00/), // 3 PM UTC = 7 AM PST
            timeZone: 'America/Los_Angeles',
          },
          end: {
            dateTime: expect.stringMatching(/2024-01-15T08:00:00-08:00/), // 4 PM UTC = 8 AM PST
            timeZone: 'America/Los_Angeles',
          },
        },
        sendNotifications: true,
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle events with only date (all-day events)', async () => {
      const existingEvent = {
        id: 'event-123',
        start: { 
          date: '2024-01-15', // All-day event
        },
        end: { 
          date: '2024-01-16',
        },
      };

      mockEvents.get.mockResolvedValue({ data: existingEvent });
      mockEvents.patch.mockResolvedValue({ data: existingEvent });

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google_calendar_update_event',
        params: {
          eventId: 'event-123',
          timeZone: 'Asia/Tokyo',
        },
      };

      await server.handleRequest(request);

      // Should not try to convert all-day events
      expect(mockEvents.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
        requestBody: {}, // No time updates for all-day events
        sendNotifications: true,
      });
    });
  });
});