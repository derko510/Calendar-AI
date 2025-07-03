import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Calendar AI API',
      version: '1.0.0',
      description: 'API for Calendar AI chatbot with RAG capabilities',
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server',
      },
      {
        url: 'http://127.0.0.1:3001',
        description: 'Development server (127.0.0.1)',
      },
    ],
    components: {
      schemas: {
        ChatMessage: {
          type: 'object',
          required: ['message'],
          properties: {
            message: {
              type: 'string',
              description: 'The user message to process',
              example: 'When was my last dentist appointment?'
            }
          }
        },
        ChatResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the request was successful'
            },
            message: {
              type: 'string',
              description: 'The chatbot response'
            },
            events: {
              type: 'array',
              description: 'Related calendar events (if any)',
              items: {
                $ref: '#/components/schemas/CalendarEvent'
              }
            }
          }
        },
        CalendarEvent: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Event ID'
            },
            title: {
              type: 'string',
              description: 'Event title'
            },
            startDatetime: {
              type: 'string',
              format: 'date-time',
              description: 'Event start time'
            },
            endDatetime: {
              type: 'string',
              format: 'date-time',
              description: 'Event end time'
            },
            location: {
              type: 'string',
              description: 'Event location'
            },
            description: {
              type: 'string',
              description: 'Event description'
            }
          }
        },
        HealthResponse: {
          type: 'object',
          properties: {
            ollama: {
              type: 'boolean',
              description: 'Whether Ollama is available'
            },
            model: {
              type: 'string',
              description: 'Active Ollama model'
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'User ID'
            },
            email: {
              type: 'string',
              description: 'User email'
            },
            name: {
              type: 'string',
              description: 'User name'
            }
          }
        },
        GoogleTokenRequest: {
          type: 'object',
          required: ['accessToken'],
          properties: {
            accessToken: {
              type: 'string',
              description: 'Google OAuth access token'
            },
            credential: {
              type: 'string',
              description: 'Google credential (optional)'
            }
          }
        },
        SyncResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether sync was successful'
            },
            message: {
              type: 'string',
              description: 'Success message'
            },
            eventCount: {
              type: 'integer',
              description: 'Number of events synced'
            }
          }
        }
      },
      securitySchemes: {
        sessionAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'connect.sid',
          description: 'Session-based authentication'
        }
      }
    }
  },
  apis: ['./src/routes/*.js'], // paths to files containing OpenAPI definitions
};

export const specs = swaggerJsdoc(options);