import { MCPServerHandler } from '@relayforge/mcp-adapter';
import { google, calendar_v3 } from 'googleapis';
import { z } from 'zod';

const CreateEventSchema = z.object({
  summary: z.string(),
  description: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
  attendees: z.array(z.string()).optional(),
  location: z.string().optional(),
});

const ListEventsSchema = z.object({
  maxResults: z.number().optional().default(10),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
});

export class GoogleCalendarSimpleServer implements MCPServerHandler {
  private calendar: calendar_v3.Calendar | null = null;

  setAccessToken(accessToken: string) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  }

  async handleRequest(request: any): Promise<any> {
    if (request.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [
            {
              name: 'google-calendar.create-event',
              description: 'Create a new calendar event',
              inputSchema: {
                type: 'object',
                properties: {
                  summary: { type: 'string', description: 'Event title' },
                  description: { type: 'string', description: 'Event description' },
                  startTime: { type: 'string', description: 'Start time in ISO 8601 format' },
                  endTime: { type: 'string', description: 'End time in ISO 8601 format' },
                  attendees: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'Email addresses of attendees' 
                  },
                  location: { type: 'string', description: 'Event location' },
                },
                required: ['summary', 'startTime', 'endTime'],
              },
            },
            {
              name: 'google-calendar.list-events',
              description: 'List calendar events',
              inputSchema: {
                type: 'object',
                properties: {
                  maxResults: { type: 'number', description: 'Maximum number of events' },
                  timeMin: { type: 'string', description: 'Lower bound for event start time' },
                  timeMax: { type: 'string', description: 'Upper bound for event start time' },
                },
              },
            },
          ],
        },
      };
    }

    if (!this.calendar) {
      throw new Error('Google Calendar not authenticated');
    }

    const { method, params, id } = request;

    switch (method) {
      case 'google-calendar.create-event': {
        const validated = CreateEventSchema.parse(params);
        
        const event: calendar_v3.Schema$Event = {
          summary: validated.summary,
          description: validated.description,
          start: {
            dateTime: validated.startTime,
            timeZone: 'UTC',
          },
          end: {
            dateTime: validated.endTime,
            timeZone: 'UTC',
          },
          location: validated.location,
          attendees: validated.attendees?.map(email => ({ email })),
        };

        const response = await this.calendar.events.insert({
          calendarId: 'primary',
          requestBody: event,
        });

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Event created successfully. Event ID: ${response.data.id}, Link: ${response.data.htmlLink}`,
              },
            ],
          },
        };
      }

      case 'google-calendar.list-events': {
        const validated = ListEventsSchema.parse(params || {});
        
        const response = await this.calendar.events.list({
          calendarId: 'primary',
          maxResults: validated.maxResults,
          timeMin: validated.timeMin,
          timeMax: validated.timeMax,
          singleEvents: true,
          orderBy: 'startTime',
        });

        const events = response.data.items || [];
        
        const eventList = events.map(event => ({
          id: event.id,
          summary: event.summary || 'No title',
          start: event.start?.dateTime || event.start?.date || 'No start time',
          end: event.end?.dateTime || event.end?.date || 'No end time',
          location: event.location || 'No location',
        }));

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(eventList, null, 2),
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  }
}