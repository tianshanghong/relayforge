import { MCPServerHandler } from '@relayforge/mcp-adapter';
import { google, calendar_v3 } from 'googleapis';
import { z } from 'zod';
import * as moment from 'moment-timezone';

// Input validation schemas
const CreateEventSchema = z.object({
  calendarId: z.string().optional().default('primary'),
  summary: z.string().min(1, 'Event title is required'),
  description: z.string().optional(),
  startTime: z.string().refine((val) => {
    // Strict ISO 8601 validation
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;
    return iso8601Regex.test(val) && !isNaN(Date.parse(val));
  }, {
    message: 'Invalid start time format. Use ISO 8601 format (e.g., 2024-01-15T10:00:00Z)',
  }),
  endTime: z.string().refine((val) => {
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;
    return iso8601Regex.test(val) && !isNaN(Date.parse(val));
  }, {
    message: 'Invalid end time format. Use ISO 8601 format (e.g., 2024-01-15T11:00:00Z)',
  }),
  attendees: z.array(z.string().email('Invalid email format')).optional(),
  location: z.string().optional(),
  timeZone: z.string().optional().default('UTC').refine((tz) => {
    try {
      // Check if timezone is valid
      return tz === 'UTC' || moment.tz.zone(tz) !== null;
    } catch (error) {
      // If moment.tz.zone throws an error, just accept common timezones
      const commonTimezones = ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London', 'Asia/Tokyo'];
      return commonTimezones.includes(tz);
    }
  }, {
    message: 'Invalid timezone. Use a valid IANA timezone identifier (e.g., America/New_York)',
  }),
  sendNotifications: z.boolean().optional().default(true),
});

const UpdateEventSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  calendarId: z.string().optional().default('primary'),
  summary: z.string().optional(),
  description: z.string().optional(),
  startTime: z.string().optional().refine((val) => {
    if (!val) return true; // Optional field
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;
    return iso8601Regex.test(val) && !isNaN(Date.parse(val));
  }, {
    message: 'Invalid start time format. Use ISO 8601 format (e.g., 2024-01-15T10:00:00Z)',
  }),
  endTime: z.string().optional().refine((val) => {
    if (!val) return true; // Optional field
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;
    return iso8601Regex.test(val) && !isNaN(Date.parse(val));
  }, {
    message: 'Invalid end time format. Use ISO 8601 format (e.g., 2024-01-15T11:00:00Z)',
  }),
  attendees: z.array(z.string().email()).optional(),
  location: z.string().optional(),
  timeZone: z.string().optional().refine((tz) => {
    if (!tz) return true; // Optional field
    try {
      // Check if timezone is valid
      return tz === 'UTC' || moment.tz.zone(tz) !== null;
    } catch (error) {
      // If moment.tz.zone throws an error, just accept common timezones
      const commonTimezones = ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London', 'Asia/Tokyo'];
      return commonTimezones.includes(tz);
    }
  }, {
    message: 'Invalid timezone. Use a valid IANA timezone identifier (e.g., America/New_York)',
  }),
  sendNotifications: z.boolean().optional().default(true),
});

const DeleteEventSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  calendarId: z.string().optional().default('primary'),
  sendNotifications: z.boolean().optional().default(true),
});

const GetEventSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  calendarId: z.string().optional().default('primary'),
});

const ListEventsSchema = z.object({
  calendarId: z.string().optional().default('primary'),
  maxResults: z.number().min(1).max(100).optional().default(10),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
  query: z.string().optional(),
  showDeleted: z.boolean().optional().default(false),
});

const ListCalendarsSchema = z.object({
  showHidden: z.boolean().optional().default(false),
  minAccessRole: z.enum(['freeBusyReader', 'reader', 'writer', 'owner']).optional(),
});

export class GoogleCalendarCompleteServer implements MCPServerHandler {
  private calendar: calendar_v3.Calendar | null = null;

  setAccessToken(accessToken: string) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  }

  private getCalendar(): calendar_v3.Calendar {
    if (!this.calendar) {
      throw new Error('Google Calendar not authenticated');
    }
    return this.calendar;
  }

  /**
   * Convert a datetime from one timezone to another, preserving the absolute moment in time
   */
  private convertDateTimeToNewTimezone(
    dateTime: string, 
    fromTimezone: string, 
    toTimezone: string
  ): string {
    // Parse the datetime in the source timezone
    const momentInSourceTz = moment.tz(dateTime, fromTimezone);
    
    // Convert to the target timezone (preserves the absolute time)
    const momentInTargetTz = momentInSourceTz.clone().tz(toTimezone);
    
    // Return in ISO format
    return momentInTargetTz.format();
  }

  async handleRequest(request: any): Promise<any> {
    const { method, params, id } = request;

    // Handle tools/list request
    if (method === 'tools/list') {
      return this.getToolsList(id);
    }

    // Handle tools/call request (MCP standard)
    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolParams = params?.arguments || {};
      
      // Ensure calendar is authenticated for tool calls
      if (!this.calendar) {
        return this.createErrorResponse(id, -32002, 'Google Calendar not authenticated');
      }

      try {
        switch (toolName) {
          case 'google-calendar_create-event':
            return await this.createEvent(id, toolParams);
          
          case 'google-calendar_update-event':
            return await this.updateEvent(id, toolParams);
          
          case 'google-calendar_delete-event':
            return await this.deleteEvent(id, toolParams);
          
          case 'google-calendar_get-event':
            return await this.getEvent(id, toolParams);
          
          case 'google-calendar_list-events':
            return await this.listEvents(id, toolParams);
          
          case 'google-calendar_list-calendars':
            return await this.listCalendars(id, toolParams);
          
          default:
            return this.createErrorResponse(id, -32602, `Unknown tool: ${toolName}`);
        }
      } catch (error) {
        return this.handleError(id, error);
      }
    }

    // Handle direct method calls (backward compatibility)
    // Ensure calendar is authenticated
    if (!this.calendar) {
      return this.createErrorResponse(id, -32002, 'Google Calendar not authenticated');
    }

    try {
      switch (method) {
        case 'google-calendar_create-event':
          return await this.createEvent(id, params);
        
        case 'google-calendar_update-event':
          return await this.updateEvent(id, params);
        
        case 'google-calendar_delete-event':
          return await this.deleteEvent(id, params);
        
        case 'google-calendar_get-event':
          return await this.getEvent(id, params);
        
        case 'google-calendar_list-events':
          return await this.listEvents(id, params);
        
        case 'google-calendar_list-calendars':
          return await this.listCalendars(id, params);
        
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
            name: 'google-calendar_create-event',
            description: 'Create a new calendar event',
            inputSchema: {
              type: 'object',
              properties: {
                calendarId: { 
                  type: 'string', 
                  description: 'Calendar ID (default: "primary"). Use list-calendars to see available calendars.' 
                },
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
                sendNotifications: { 
                  type: 'boolean', 
                  description: 'Whether to send email notifications to attendees (default: true)' 
                },
              },
              required: ['summary', 'startTime', 'endTime'],
            },
          },
          {
            name: 'google-calendar_update-event',
            description: 'Update an existing calendar event. Note: When updating only the timezone, the event time is preserved (the absolute moment stays the same, but is displayed in the new timezone).',
            inputSchema: {
              type: 'object',
              properties: {
                eventId: { 
                  type: 'string', 
                  description: 'ID of the event to update (required)' 
                },
                calendarId: { 
                  type: 'string', 
                  description: 'Calendar ID (default: "primary"). Use list-calendars to see available calendars.' 
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
                  description: 'Time zone (IANA format). When changed alone, preserves the absolute event time.' 
                },
                sendNotifications: { 
                  type: 'boolean', 
                  description: 'Whether to send email notifications about the update (default: true)' 
                },
              },
              required: ['eventId'],
            },
          },
          {
            name: 'google-calendar_delete-event',
            description: 'Delete a calendar event',
            inputSchema: {
              type: 'object',
              properties: {
                eventId: { 
                  type: 'string', 
                  description: 'ID of the event to delete (required)' 
                },
                calendarId: { 
                  type: 'string', 
                  description: 'Calendar ID (default: "primary"). Use list-calendars to see available calendars.' 
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
            name: 'google-calendar_get-event',
            description: 'Get details of a specific calendar event',
            inputSchema: {
              type: 'object',
              properties: {
                eventId: { 
                  type: 'string', 
                  description: 'ID of the event to retrieve (required)' 
                },
                calendarId: { 
                  type: 'string', 
                  description: 'Calendar ID (default: "primary"). Use list-calendars to see available calendars.' 
                },
              },
              required: ['eventId'],
            },
          },
          {
            name: 'google-calendar_list-events',
            description: 'List calendar events',
            inputSchema: {
              type: 'object',
              properties: {
                calendarId: { 
                  type: 'string', 
                  description: 'Calendar ID (default: "primary"). Use list-calendars to see available calendars.' 
                },
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
          {
            name: 'google-calendar_list-calendars',
            description: 'List all calendars accessible to the user',
            inputSchema: {
              type: 'object',
              properties: {
                showHidden: { 
                  type: 'boolean', 
                  description: 'Show hidden calendars (default: false)' 
                },
                minAccessRole: { 
                  type: 'string', 
                  enum: ['freeBusyReader', 'reader', 'writer', 'owner'],
                  description: 'Filter by minimum access role' 
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

    const response = await this.getCalendar().events.insert({
      calendarId: validated.calendarId,
      requestBody: event,
      sendNotifications: validated.sendNotifications,
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
    
    // Build patch object with only provided fields
    const patchData: calendar_v3.Schema$Event = {};
    
    if (validated.summary !== undefined) patchData.summary = validated.summary;
    if (validated.description !== undefined) patchData.description = validated.description;
    if (validated.location !== undefined) patchData.location = validated.location;
    
    if (validated.attendees !== undefined) {
      patchData.attendees = validated.attendees.map(email => ({ email }));
    }
    
    // Only fetch existing event if we need to merge time/timezone fields
    if (validated.startTime !== undefined || validated.endTime !== undefined || validated.timeZone !== undefined) {
      // We need existing event data to properly handle partial time updates
      const existingEvent = await this.getCalendar().events.get({
        calendarId: validated.calendarId,
        eventId: validated.eventId,
      });

      if (!existingEvent.data) {
        return this.createErrorResponse(id, -32000, 'Event not found');
      }

      // Check if this is a timezone-only update (needs special handling)
      const isTimezoneOnlyUpdate = validated.timeZone !== undefined && 
                                   validated.startTime === undefined && 
                                   validated.endTime === undefined;

      if (isTimezoneOnlyUpdate && validated.timeZone) {
        // Timezone-only update: convert times to preserve absolute moment
        const existingStartTime = existingEvent.data.start?.dateTime;
        const existingEndTime = existingEvent.data.end?.dateTime;
        const existingStartTz = existingEvent.data.start?.timeZone || 'UTC';
        const existingEndTz = existingEvent.data.end?.timeZone || 'UTC';

        if (existingStartTime) {
          patchData.start = {
            dateTime: this.convertDateTimeToNewTimezone(
              existingStartTime,
              existingStartTz,
              validated.timeZone
            ),
            timeZone: validated.timeZone,
          };
        }

        if (existingEndTime) {
          patchData.end = {
            dateTime: this.convertDateTimeToNewTimezone(
              existingEndTime,
              existingEndTz,
              validated.timeZone
            ),
            timeZone: validated.timeZone,
          };
        }
      } else {
        // Handle time updates normally (when times are explicitly provided)
        if (validated.startTime !== undefined || validated.timeZone !== undefined) {
          patchData.start = {
            dateTime: validated.startTime || existingEvent.data.start?.dateTime,
            timeZone: validated.timeZone || existingEvent.data.start?.timeZone || 'UTC',
          };
        }
        
        if (validated.endTime !== undefined || validated.timeZone !== undefined) {
          patchData.end = {
            dateTime: validated.endTime || existingEvent.data.end?.dateTime,
            timeZone: validated.timeZone || existingEvent.data.end?.timeZone || 'UTC',
          };
        }
      }
    }

    try {
      // Use patch method for partial updates
      const response = await this.getCalendar().events.patch({
        calendarId: validated.calendarId,
        eventId: validated.eventId,
        requestBody: patchData,
        sendNotifications: validated.sendNotifications,
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
    } catch (error) {
      // If patch fails with 404, provide better error message
      if ((error as any)?.response?.status === 404) {
        return this.createErrorResponse(id, -32000, 'Event not found');
      }
      throw error;
    }
  }

  private async deleteEvent(id: any, params: any) {
    const validated = DeleteEventSchema.parse(params);
    
    await this.getCalendar().events.delete({
      calendarId: validated.calendarId,
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
    
    const response = await this.getCalendar().events.get({
      calendarId: validated.calendarId,
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
    
    const response = await this.getCalendar().events.list({
      calendarId: validated.calendarId,
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

  private async listCalendars(id: any, params: any) {
    const validated = ListCalendarsSchema.parse(params || {});
    
    const response = await this.getCalendar().calendarList.list({
      showHidden: validated.showHidden,
      minAccessRole: validated.minAccessRole,
    });

    const calendars = response.data.items || [];
    
    const formattedCalendars = calendars.map(calendar => ({
      id: calendar.id,
      summary: calendar.summary || 'Unnamed Calendar',
      description: calendar.description,
      primary: calendar.primary || false,
      accessRole: calendar.accessRole,
      backgroundColor: calendar.backgroundColor,
      foregroundColor: calendar.foregroundColor,
      timeZone: calendar.timeZone,
      selected: calendar.selected,
      hidden: calendar.hidden,
    }));

    const resultText = calendars.length === 0 
      ? 'No calendars found' 
      : `Found ${calendars.length} calendar${calendars.length === 1 ? '' : 's'}:\n\n${JSON.stringify(formattedCalendars, null, 2)}`;

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
      
      // Special handling for calendar not found errors
      if (error.response.status === 404 && apiError.message?.includes('Calendar not found')) {
        return this.createErrorResponse(
          id,
          -32000,
          `Calendar not found. Use list-calendars to see available calendars.`
        );
      }
      
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