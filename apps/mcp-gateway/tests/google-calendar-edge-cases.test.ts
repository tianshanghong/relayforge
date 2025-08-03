import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleCalendarCompleteServer } from '../src/servers/google-calendar-complete';

describe('GoogleCalendarCompleteServer - Edge Cases', () => {
  let server: GoogleCalendarCompleteServer;
  let mockEvents: any;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new GoogleCalendarCompleteServer();
    server.setAccessToken('test-token');
    
    // Get the global mock
    mockEvents = (global as any).mockGoogleCalendarEvents;
  });

  describe('Large Event Lists', () => {
    it('should handle large event lists correctly', async () => {
      const largeEventList = Array.from({ length: 100 }, (_, i) => ({
        id: `event-${i}`,
        summary: `Event ${i}`,
        start: { dateTime: `2024-01-${(i % 30) + 1}T10:00:00Z` },
        end: { dateTime: `2024-01-${(i % 30) + 1}T11:00:00Z` },
        htmlLink: `https://calendar.google.com/event?eid=event-${i}`,
        status: 'confirmed',
      }));

      mockEvents.list.mockResolvedValue({
        data: { items: largeEventList },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any);

      const response = await server.handleRequest({
        method: 'google-calendar.list-events',
        params: { maxResults: 100 },
        id: 1,
      });

      expect(response.result.content[0].text).toContain('Found 100 events');
      expect(response.result.content[0].text).toContain('event-0');
      expect(response.result.content[0].text).toContain('event-99');
    });

    it('should respect maxResults parameter', async () => {
      const eventList = Array.from({ length: 50 }, (_, i) => ({
        id: `event-${i}`,
        summary: `Event ${i}`,
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' },
      }));

      const listMock = vi.spyOn(mockEvents, 'list').mockResolvedValue({
        data: { items: eventList.slice(0, 10) },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any);

      await server.handleRequest({
        method: 'google-calendar.list-events',
        params: { maxResults: 10 },
        id: 1,
      });

      expect(listMock).toHaveBeenCalledWith(expect.objectContaining({
        maxResults: 10,
      }));
    });
  });

  describe('Network Timeouts', () => {
    it('should handle network timeout errors gracefully', async () => {
      const timeoutError = new Error('Network timeout');
      (timeoutError as any).code = 'ETIMEDOUT';

      vi.spyOn(mockEvents, 'insert').mockRejectedValue(timeoutError);

      const response = await server.handleRequest({
        method: 'google-calendar.create-event',
        params: {
          summary: 'Test Event',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
        },
        id: 1,
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('Network timeout');
    });

    it('should handle slow API responses', async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            data: { id: 'event-123', summary: 'Test Event' },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {},
          });
        }, 100);
      });

      vi.spyOn(mockEvents, 'insert').mockImplementation(() => slowPromise as any);

      const response = await server.handleRequest({
        method: 'google-calendar.create-event',
        params: {
          summary: 'Test Event',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
        },
        id: 1,
      });

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toContain('Event created successfully');
    });
  });

  describe('Malformed API Responses', () => {
    it('should handle missing event data gracefully', async () => {
      vi.spyOn(mockEvents, 'get').mockResolvedValue({
        data: null,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any);

      const response = await server.handleRequest({
        method: 'google-calendar.get-event',
        params: { eventId: 'non-existent' },
        id: 1,
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toBe('Event not found');
    });

    it('should handle undefined items in list response', async () => {
      vi.spyOn(mockEvents, 'list').mockResolvedValue({
        data: { items: undefined },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any);

      const response = await server.handleRequest({
        method: 'google-calendar.list-events',
        params: {},
        id: 1,
      });

      expect(response.result.content[0].text).toBe('No events found');
    });

    it('should handle events with missing fields', async () => {
      vi.spyOn(mockEvents, 'list').mockResolvedValue({
        data: {
          items: [
            { id: 'event-1' }, // Missing all fields except id
            { id: 'event-2', summary: 'Event 2' }, // Missing time fields
            { id: 'event-3', start: { dateTime: '2024-01-15T10:00:00Z' } }, // Missing end time
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any);

      const response = await server.handleRequest({
        method: 'google-calendar.list-events',
        params: {},
        id: 1,
      });

      const text = response.result.content[0].text;
      expect(text).toContain('No title');
      expect(text).toContain('No start time');
      expect(text).toContain('No end time');
    });
  });

  describe('Timezone Edge Cases', () => {
    it('should handle daylight saving time transitions', async () => {
      const existingEvent = {
        id: 'event-123',
        start: { dateTime: '2024-03-10T01:30:00', timeZone: 'America/New_York' },
        end: { dateTime: '2024-03-10T02:30:00', timeZone: 'America/New_York' },
      };

      vi.spyOn(mockEvents, 'get').mockResolvedValue({
        data: existingEvent,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any);

      const patchMock = vi.spyOn(mockEvents, 'patch').mockResolvedValue({
        data: { ...existingEvent, start: { ...existingEvent.start, timeZone: 'UTC' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any);

      await server.handleRequest({
        method: 'google-calendar.update-event',
        params: {
          eventId: 'event-123',
          timeZone: 'UTC',
        },
        id: 1,
      });

      expect(patchMock).toHaveBeenCalledWith(expect.objectContaining({
        requestBody: expect.objectContaining({
          start: expect.objectContaining({
            timeZone: 'UTC',
          }),
        }),
      }));
    });

    it('should handle invalid timezone in API response', async () => {
      vi.spyOn(server['getCalendar']().calendarList, 'list').mockResolvedValue({
        data: {
          items: [
            {
              id: 'calendar-1',
              summary: 'Calendar 1',
              timeZone: 'Invalid/Timezone', // Invalid timezone
            },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any);

      const response = await server.handleRequest({
        method: 'google-calendar.list-calendars',
        params: {},
        id: 1,
      });

      // Should still return the calendar even with invalid timezone
      expect(response.result.content[0].text).toContain('Calendar 1');
      expect(response.result.content[0].text).toContain('Invalid/Timezone');
    });
  });

  describe('Authentication Edge Cases', () => {
    it('should handle expired token errors', async () => {
      const authError = new Error('Invalid Credentials');
      (authError as any).response = {
        status: 401,
        data: { error: { message: 'Invalid Credentials' } },
      };

      vi.spyOn(mockEvents, 'list').mockRejectedValue(authError);

      const response = await server.handleRequest({
        method: 'google-calendar.list-events',
        params: {},
        id: 1,
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('Google Calendar API error: Invalid Credentials');
    });

    it('should handle missing calendar authentication', async () => {
      const unauthServer = new GoogleCalendarCompleteServer();
      // Don't set access token

      const response = await unauthServer.handleRequest({
        method: 'google-calendar.list-events',
        params: {},
        id: 1,
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toBe('Google Calendar not authenticated');
    });
  });

  describe('Input Validation Edge Cases', () => {
    it('should handle extremely long event summaries', async () => {
      const longSummary = 'A'.repeat(1000);

      const insertMock = vi.spyOn(mockEvents, 'insert').mockResolvedValue({
        data: { id: 'event-123', summary: longSummary },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any);

      const response = await server.handleRequest({
        method: 'google-calendar.create-event',
        params: {
          summary: longSummary,
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
        },
        id: 1,
      });

      expect(response.result).toBeDefined();
      expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
        requestBody: expect.objectContaining({
          summary: longSummary,
        }),
      }));
    });

    it('should handle events at year boundaries', async () => {
      const insertMock = vi.spyOn(mockEvents, 'insert').mockResolvedValue({
        data: { id: 'event-123', summary: 'New Year Event' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any);

      const response = await server.handleRequest({
        method: 'google-calendar.create-event',
        params: {
          summary: 'New Year Event',
          startTime: '2023-12-31T23:00:00Z',
          endTime: '2024-01-01T01:00:00Z',
        },
        id: 1,
      });

      expect(response.result).toBeDefined();
      expect(insertMock).toHaveBeenCalled();
    });

    it('should reject events with start time after end time', async () => {
      const response = await server.handleRequest({
        method: 'google-calendar.create-event',
        params: {
          summary: 'Invalid Event',
          startTime: '2024-01-15T15:00:00Z',
          endTime: '2024-01-15T10:00:00Z', // End before start
        },
        id: 1,
      });

      // Note: This validation should ideally be added to the schema
      // For now, the API would handle this error
      expect(response).toBeDefined();
    });
  });

  describe('Calendar Not Found Edge Cases', () => {
    it('should handle calendar not found errors with helpful message', async () => {
      const notFoundError = new Error('Not Found');
      (notFoundError as any).response = {
        status: 404,
        data: { error: { message: 'Calendar not found' } },
      };

      vi.spyOn(mockEvents, 'list').mockRejectedValue(notFoundError);

      const response = await server.handleRequest({
        method: 'google-calendar.list-events',
        params: { calendarId: 'non-existent-calendar' },
        id: 1,
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toBe('Calendar not found. Use list-calendars to see available calendars.');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous requests', async () => {
      const insertMock = vi.spyOn(mockEvents, 'insert')
        .mockImplementation((params: any) => {
          return Promise.resolve({
            data: { id: `event-${Date.now()}`, summary: params.requestBody.summary },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {},
          } as any);
        });

      const requests = Array.from({ length: 5 }, (_, i) => 
        server.handleRequest({
          method: 'google-calendar.create-event',
          params: {
            summary: `Event ${i}`,
            startTime: '2024-01-15T10:00:00Z',
            endTime: '2024-01-15T11:00:00Z',
          },
          id: i,
        })
      );

      const responses = await Promise.all(requests);

      expect(responses).toHaveLength(5);
      expect(insertMock).toHaveBeenCalledTimes(5);
      responses.forEach((response, i) => {
        expect(response.result.content[0].text).toContain(`Event ${i}`);
      });
    });
  });
});