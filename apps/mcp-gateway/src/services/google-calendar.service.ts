import { MCPRequest, MCPResponse } from '@relayforge/shared';
import { MCPService } from '../types/service.types.js';
import { GoogleCalendarCompleteServer } from '../servers/google-calendar-complete.js';

/**
 * Google Calendar service wrapper that implements MCPService interface
 */
export class GoogleCalendarService implements MCPService {
  private server: GoogleCalendarCompleteServer;

  constructor() {
    this.server = new GoogleCalendarCompleteServer();
  }

  /**
   * Set OAuth access token for authenticated requests
   */
  setAccessToken(token: string): void {
    // Pass the token directly to the server
    this.server.setAccessToken(token);
  }

  /**
   * Handle MCP request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    // Forward to the actual server - authentication is already set
    return await this.server.handleRequest(request);
  }

  /**
   * Get available tools/methods
   */
  async getTools(): Promise<any> {
    // Return the Google Calendar tools
    return {
      tools: [
        {
          name: 'google-calendar_create-event',
          description: 'Create a new calendar event',
        },
        {
          name: 'google-calendar_list-events',
          description: 'List calendar events',
        },
        {
          name: 'google-calendar_update-event',
          description: 'Update an existing calendar event',
        },
        {
          name: 'google-calendar_delete-event',
          description: 'Delete a calendar event',
        },
        {
          name: 'google-calendar_get-event',
          description: 'Get a specific calendar event',
        },
        {
          name: 'google-calendar_list-calendars',
          description: 'List available calendars',
        },
      ],
    };
  }
}