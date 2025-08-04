import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Import our tool modules (we'll create these in the next steps)
import { weatherTools } from './tools/weather.js';
import { eventTools } from './tools/events.js';
import { expenseTools } from './tools/expenses.js';
import { itineraryTools } from './tools/itinerary.js';
import { gamificationTools } from './tools/gamification.js';

// Define the types for our Cloudflare Worker environment
type Bindings = {
  DB: D1Database;                    // Cloudflare D1 database
  GOOGLE_MAPS_API_KEY: string;       // Google Maps API key
  GEMINI_API_KEY: string;            // Gemini AI API key
  BETTER_AUTH_SECRET: string;        // Authentication secret
  FP_CLIENT_ID: string;              // Fiberplane OAuth client ID
  FP_CLIENT_SECRET: string;          // Fiberplane OAuth secret
};

// Create our Hono application with typed environment bindings
const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS (Cross-Origin Resource Sharing) for all routes
// This allows web browsers to connect to our MCP server
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check endpoint - useful for monitoring if our server is running
app.get('/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'Travel Assistant MCP Server',
    version: '1.0.0'
  });
});

// Root endpoint - provides basic server information
app.get('/', (c) => {
  return c.json({
    name: 'Travel Assistant MCP Server',
    description: 'A comprehensive travel planning assistant with gamification',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      mcp: '/mcp'
    },
    tools: [
      'Weather checking and forecasts',
      'Local event discovery',
      'Expense tracking and budgeting', 
      'Itinerary building and optimization',
      'Gamification and rewards system'
    ]
  });
});

// Main MCP endpoint - manual implementation for reliability
app.post('/mcp', async (c) => {
  try {
    const body = await c.req.json();
    console.log('📥 Received MCP request:', body);

    // Collect all available tools from our different modules
    const allTools = [
      ...weatherTools,      // Weather checking tools
      ...eventTools,        // Event discovery tools
      ...expenseTools,      // Expense tracking tools
      ...itineraryTools,    // Itinerary building tools
      ...gamificationTools  // Points and rewards tools
    ];

    // Handle different MCP methods manually (more reliable than SDK)
    switch (body.method) {
      case 'tools/list':
        console.log('📋 Listing available tools...');
        return c.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: allTools.map(tool => ({
              name: tool.definition.name,
              description: tool.definition.description,
              inputSchema: tool.definition.inputSchema
            }))
          }
        });

      case 'tools/call':
        const { name, arguments: args } = body.params;
        console.log(`🔧 Executing tool: ${name} with args:`, args);
        
        // Find the requested tool in our collection
        const tool = allTools.find(t => t.definition.name === name);
        if (!tool) {
          return c.json({
            jsonrpc: "2.0",
            id: body.id,
            error: {
              code: -32601,
              message: `Tool "${name}" not found. Available tools: ${allTools.map(t => t.definition.name).join(', ')}`
            }
          }, 400);
        }

        try {
          // Execute the tool with the provided arguments and environment
          const result = await tool.handler(args, c.env);
          console.log(`✅ Tool ${name} executed successfully`);
          
          // Return the result in MCP format
          return c.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            }
          });
        } catch (error) {
          console.error(`❌ Tool ${name} execution failed:`, error);
          return c.json({
            jsonrpc: "2.0",
            id: body.id,
            error: {
              code: -32603,
              message: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }, 500);
        }

      case 'initialize':
        // Handle MCP initialization
        console.log('🚀 MCP Server initializing...');
        return c.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: "travel-assistant",
              version: "1.0.0"
            }
          }
        });

      case 'ping':
        // Handle ping requests
        return c.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {}
        });

      default:
        console.log(`❓ Unknown MCP method: ${body.method}`);
        return c.json({
          jsonrpc: "2.0",
          id: body.id,
          error: {
            code: -32601,
            message: `Method "${body.method}" not found. Available methods: tools/list, tools/call, initialize, ping`
          }
        }, 400);
    }
    
  } catch (error) {
    console.error('💥 MCP Server Error:', error);
    
    return c.json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal server error'
      }
    }, 500);
  }
});

// Handle 404 errors for undefined routes
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    availableEndpoints: ['/', '/health', '/mcp']
  }, 404);
});

// Global error handler
app.onError((err, c) => {
  console.error('🚨 Global Error Handler:', err);
  
  return c.json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  }, 500);
});

// Export the app for Cloudflare Workers
export default app;
