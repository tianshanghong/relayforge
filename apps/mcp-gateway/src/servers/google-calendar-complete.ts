import { MCPServerHandler } from '@relayforge/mcp-adapter';
import { google, calendar_v3 } from 'googleapis';
import { z } from 'zod';

// Input validation schemas
const CreateEventSchema = z.object({
  summary: z.string().min(1, 'Event title is required'),
  description: z.string().optional(),
  startTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid start time format. Use ISO 8601 format',
  }),
  endTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid end time format. Use ISO 8601 format',
  }),
  attendees: z.array(z.string().email('Invalid email format')).optional(),
  location: z.string().optional(),
  timeZone: z.string().optional().default('UTC'),
});

const UpdateEventSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  summary: z.string().optional(),
  description: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  attendees: z.array(z.string().email()).optional(),
  location: z.string().optional(),
  timeZone: z.string().optional(),
});

const DeleteEventSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  sendNotifications: z.boolean().optional().default(true),
});

const GetEventSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
});

const ListEventsSchema = z.object({
  maxResults: z.number().min(1).max(100).optional().default(10),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
  query: z.string().optional(),
  showDeleted: z.boolean().optional().default(false),
});

export class GoogleCalendarCompleteServer implements MCPServerHandler {
  private calendar: calendar_v3.Calendar | null = null;

  setAccessToken(accessToken: string) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  }

  async handleRequest(request: any): Promise<any> {
    const { method, params, id } = request;

    // Handle tools/list request
    if (method === 'tools/list') {
      return this.getToolsList(id);
    }

    // Ensure calendar is authenticated
    if (!this.calendar) {
      return this.createErrorResponse(id, -32002, 'Google Calendar not authenticated');
    }

    try {
      switch (method) {
        case 'google-calendar.create-event':
          return await this.createEvent(id, params);
        
        case 'google-calendar.update-event':
          return await this.updateEvent(id, params);
        
        case 'google-calendar.delete-event':
          return await this.deleteEvent(id, params);
        
        case 'google-calendar.get-event':
          return await this.getEvent(id, params);
        
        case 'google-calendar.list-events':
          return await this.listEvents(id, params);
        
        default:
          return this.createErrorResponse(id, -32601, `Method not found: ${method}`);
      }
    } catch (error) {
      return this.handleError(id, error);
    }
  }

  private getToolsList(id: any) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'google-calendar.create-event',
            description: 'Create a new calendar event',
            inputSchema: {
              type: 'object',
              properties: {
                summary: { 
                  type: 'string', 
                  description: 'Event title (required)' 
                },
                description: { 
                  type: 'string', 
                  description: 'Event description' 
                },
                startTime: { 
                  type: 'string', 
                  description: 'Start time in ISO 8601 format (e.g., 2024-01-15T10:00:00Z)' 
                },
                endTime: { 
                  type: 'string', 
                  description: 'End time in ISO 8601 format' 
                },
                attendees: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Email addresses of attendees' 
                },
                location: { 
                  type: 'string', 
                  description: 'Event location' 
                },
                timeZone: { 
                  type: 'string', 
                  description: 'Time zone (default: UTC)' 
                },
              },
              required: ['summary', 'startTime', 'endTime'],
            },
          },
          {
            name: 'google-calendar.update-event',
            description: 'Update an existing calendar event',
            inputSchema: {
              type: 'object',
              properties: {
                eventId: { 
                  type: 'string', 
                  description: 'ID of the event to update (required)' 
                },
                summary: { 
                  type: 'string', 
                  description: 'New event title' 
                },
                description: { 
                  type: 'string', 
                  description: 'New event description' 
                },
                startTime: { 
                  type: 'string', 
                  description: 'New start time in ISO 8601 format' 
                },
                endTime: { 
                  type: 'string', 
                  description: 'New end time in ISO 8601 format' 
                },
                attendees: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'New list of attendee emails' 
                },
                location: { 
                  type: 'string', 
                  description: 'New event location' 
                },
                timeZone: { 
                  type: 'string', 
                  description: 'Time zone' 
                },
              },
              required: ['eventId'],
            },
          },
          {
            name: 'google-calendar.delete-event',
            description: 'Delete a calendar event',
            inputSchema: {
              type: 'object',
              properties: {
                eventId: { 
                  type: 'string', 
                  description: 'ID of the event to delete (required)' 
                },
                sendNotifications: { 
                  type: 'boolean', 
                  description: 'Whether to send notifications about the deletion (default: true)' 
                },
              },
              required: ['eventId'],
            },
          },
          {
            name: 'google-calendar.get-event',
            description: 'Get details of a specific calendar event',
            inputSchema: {
              type: 'object',
              properties: {
                eventId: { 
                  type: 'string', 
                  description: 'ID of the event to retrieve (required)' 
                },
              },
              required: ['eventId'],
            },
          },
          {
            name: 'google-calendar.list-events',
            description: 'List calendar events',
            inputSchema: {
              type: 'object',
              properties: {
                maxResults: { 
                  type: 'number', 
                  description: 'Maximum number of events to return (1-100, default: 10)' 
                },
                timeMin: { 
                  type: 'string', 
                  description: 'Lower bound for event start time (ISO 8601)' 
                },
                timeMax: { 
                  type: 'string', 
                  description: 'Upper bound for event start time (ISO 8601)' 
                },
                query: { 
                  type: 'string', 
                  description: 'Text to search for in event data' 
                },
                showDeleted: { 
                  type: 'boolean', 
                  description: 'Whether to include deleted events (default: false)' 
                },
              },
            },
          },
        ],
      },
    };
  }

  private async createEvent(id: any, params: any) {
    const validated = CreateEventSchema.parse(params);
    
    const event: calendar_v3.Schema$Event = {
      summary: validated.summary,
      description: validated.description,
      start: {
        dateTime: validated.startTime,
        timeZone: validated.timeZone,
      },
      end: {
        dateTime: validated.endTime,
        timeZone: validated.timeZone,
      },
      location: validated.location,
      attendees: validated.attendees?.map(email => ({ email })),
    };

    const response = await this.calendar!.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendNotifications: true,
    });

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: this.formatEventResponse(response.data, 'Event created successfully'),
          },
        ],
      },
    };
  }

  private async updateEvent(id: any, params: any) {
    const validated = UpdateEventSchema.parse(params);
    
    // First get the existing event
    const existingEvent = await this.calendar!.events.get({
      calendarId: 'primary',
      eventId: validated.eventId,
    });

    if (!existingEvent.data) {
      return this.createErrorResponse(id, -32000, 'Event not found');
    }

    // Build update object with only changed fields
    const updateData: calendar_v3.Schema$Event = {
      ...existingEvent.data,
    };

    if (validated.summary !== undefined) updateData.summary = validated.summary;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.location !== undefined) updateData.location = validated.location;
    
    if (validated.startTime !== undefined || validated.timeZone !== undefined) {
      updateData.start = {
        dateTime: validated.startTime || existingEvent.data.start?.dateTime,
        timeZone: validated.timeZone || existingEvent.data.start?.timeZone || 'UTC',
      };
    }
    
    if (validated.endTime !== undefined || validated.timeZone !== undefined) {
      updateData.end = {
        dateTime: validated.endTime || existingEvent.data.end?.dateTime,
        timeZone: validated.timeZone || existingEvent.data.end?.timeZone || 'UTC',
      };
    }
    
    if (validated.attendees !== undefined) {
      updateData.attendees = validated.attendees.map(email => ({ email }));
    }

    const response = await this.calendar!.events.update({
      calendarId: 'primary',
      eventId: validated.eventId,
      requestBody: updateData,
      sendNotifications: true,
    });

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: this.formatEventResponse(response.data, 'Event updated successfully'),
          },
        ],
      },
    };
  }

  private async deleteEvent(id: any, params: any) {
    const validated = DeleteEventSchema.parse(params);
    
    await this.calendar!.events.delete({
      calendarId: 'primary',
      eventId: validated.eventId,
      sendNotifications: validated.sendNotifications,
    });

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: `Event deleted successfully. Event ID: ${validated.eventId}`,
          },
        ],
      },
    };
  }

  private async getEvent(id: any, params: any) {
    const validated = GetEventSchema.parse(params);
    
    const response = await this.calendar!.events.get({
      calendarId: 'primary',
      eventId: validated.eventId,
    });

    if (!response.data) {
      return this.createErrorResponse(id, -32000, 'Event not found');
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: this.formatEventResponse(response.data, 'Event details'),
          },
        ],
      },
    };
  }

  private async listEvents(id: any, params: any) {
    const validated = ListEventsSchema.parse(params || {});
    
    const response = await this.calendar!.events.list({
      calendarId: 'primary',
      maxResults: validated.maxResults,
      timeMin: validated.timeMin,
      timeMax: validated.timeMax,
      q: validated.query,
      showDeleted: validated.showDeleted,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    const formattedEvents = events.map(event => ({
      id: event.id,
      summary: event.summary || 'No title',
      description: event.description || undefined,
      start: event.start?.dateTime || event.start?.date || 'No start time',
      end: event.end?.dateTime || event.end?.date || 'No end time',
      location: event.location || undefined,
      attendees: event.attendees?.map(a => a.email) || undefined,
      link: event.htmlLink,
      status: event.status,
    }));

    const resultText = events.length === 0 
      ? 'No events found' 
      : `Found ${events.length} event${events.length === 1 ? '' : 's'}:\n\n${JSON.stringify(formattedEvents, null, 2)}`;

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: resultText,
          },
        ],
      },
    };
  }

  private formatEventResponse(event: calendar_v3.Schema$Event, message: string): string {
    const details = {
      id: event.id,
      summary: event.summary,
      description: event.description,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      location: event.location,
      attendees: event.attendees?.map(a => a.email),
      link: event.htmlLink,
      status: event.status,
    };

    // Remove undefined values for cleaner output
    Object.keys(details).forEach(key => 
      details[key as keyof typeof details] === undefined && delete details[key as keyof typeof details]
    );

    return `${message}\n\n${JSON.stringify(details, null, 2)}`;
  }

  private createErrorResponse(id: any, code: number, message: string) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
      },
    };
  }

  private handleError(id: any, error: any) {
    console.error('Google Calendar error:', error);

    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      const issues = error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      return this.createErrorResponse(
        id, 
        -32602, 
        `Invalid parameters: ${issues.join(', ')}`
      );
    }

    // Handle Google API errors
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      return this.createErrorResponse(
        id,
        -32000,
        `Google Calendar API error: ${apiError.message || 'Unknown error'}`
      );
    }

    // Handle authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('unauthorized')) {
      return this.createErrorResponse(
        id,
        -32002,
        'Authentication failed. Please reconnect your Google account.'
      );
    }

    // Generic error
    return this.createErrorResponse(
      id,
      -32603,
      error.message || 'Internal error occurred'
    );
  }
}