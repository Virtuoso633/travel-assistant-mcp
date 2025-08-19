# Travel Assistant MCP Server

A **production-ready Model Context Protocol (MCP) server** for intelligent travel planning.  
It combines **16 powerful tools**, live API integrations, database persistence, and a gamification system—perfect for the Vibe Summer Challenge 2025.

---

## 🌐 Live Deployment

| Endpoint         | URL                                                                 |
|------------------|---------------------------------------------------------------------|
| **MCP Server**   | https://travel-assistant-mcp.virtuosoofcoding633.workers.dev/mcp    |
| **Health Check** | https://travel-assistant-mcp.virtuosoofcoding633.workers.dev/health |

---

## ✨ Feature Highlights

1. **16 MCP tools** (weather, events, expenses, itinerary, gamification)
2. **Real APIs**: FreeCurrencyAPI, Google Places, Open-Meteo, REST Countries
3. **Gamification**: Points, levels, unlockable rewards
4. **Cloudflare Workers + D1** (SQLite) for serverless scale
5. **TypeScript + Hono.js + Drizzle ORM** for type-safe development
6. **<7 ms** average cold-start; sub-second responses

---

## 📁 Project Structure

```
travel-assistant-mcp/
├── src/
│   ├── index.ts               # Worker entry
│   ├── tools/                 # 16 MCP tool handlers
│   ├── db/                    # Drizzle schema & migrations
│   └── lib/                   # API helpers & gamification logic
├── drizzle.config.ts
├── wrangler.toml
├── package.json
├── .dev.vars.example
└── README.md
```

---

## 🚀 Quick Start

### 1. Clone & Install

```sh
git clone https://github.com/Virtuoso633/travel-assistant-mcp.git
cd travel-assistant-mcp
npm install
```

### 2. Environment Variables

```sh
cp .dev.vars.example .dev.vars
# Edit .dev.vars and add any API keys (optional – fallbacks provided)
```

### 3. Local Database & Dev Server

```sh
npm run db:generate     # create drizzle client
npm run db:migrate      # apply migrations locally
npm run dev             # wrangler dev --local (http://localhost:8787)
```

### 4. Test Locally

```sh
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## 🏗️ Deploy to Cloudflare

### Login & Deploy

```sh
npx wrangler login                # OAuth or API token
npm run deploy                    # wrangler deploy
```

### Remote Migration

```sh
npm run db:migrate:prod           # applies migrations to D1 prod DB
```

---

## 🔧 MCP Usage Examples

### List Tools

```sh
curl -X POST https://travel-assistant-mcp.virtuosoofcoding633.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Create Itinerary

```sh
curl -X POST https://travel-assistant-mcp.virtuosoofcoding633.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
        "jsonrpc":"2.0",
        "id":1,
        "method":"tools/call",
        "params":{
          "name":"create_itinerary",
          "arguments":{
            "destination":"Kyoto, Japan",
            "duration":3,
            "startDate":"2025-09-15",
            "interests":["culture","food"],
            "budget":"mid-range",
            "travelStyle":"solo",
            "userId":"demo_user"
          }
        }
      }'
```

---

## 🖥️ Claude Desktop Integration

1. Create or edit:
   ```
   ~/.config/claude-desktop/claude_desktop_config.json
   ```
2. Add:
   ```json
   {
     "mcpServers": {
       "travel-assistant": {
         "command": "npx",
         "args": ["@modelcontextprotocol/server-http", "https://travel-assistant-mcp.virtuosoofcoding633.workers.dev/mcp"]
       }
     }
   }
   ```
3. Restart Claude Desktop and use prompts like:
   ```
   Plan a 5-day trip to Tokyo with a mid-range budget.
   ```

---

## 📜 API Reference (MCP)

### tools/list

```json
POST /mcp
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

### tools/call

```json
POST /mcp
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": { /* tool-specific */ }
  }
}
```

---

## 🛠️ Scripts

```sh
npm run dev                # local Cloudflare Worker
npm run deploy             # deploy to Cloudflare
npm run db:generate        # generate drizzle client
npm run db:migrate         # migrate local DB
npm run db:migrate:prod    # migrate prod D1
npm run test               # MCP inspector
npm run lint               # eslint
npm run type-check         # TypeScript strict check
```

---

## 🌤️ 16 MCP Tools (Quick List)

| Category    | Tool                      | Description                |
|-------------|---------------------------|----------------------------|
| Weather     | `get_weather`             | 5-day forecast             |
|             | `compare_weather`         | Compare two locations      |
| Events      | `find_events`             | Google Places search       |
|             | `save_event`              | Save place to plan         |
|             | `get_saved_places`        | List saved places          |
|             | `get_place_details`       | Detailed place info        |
| Expenses    | `add_expense`             | Track expense with FX      |
|             | `convert_currency_live`   | Live conversion            |
|             | `get_live_exchange_rates` | Multi-currency rates       |
|             | `get_expense_summary`     | Totals & breakdown         |
| Itinerary   | `create_itinerary`        | AI travel plan             |
|             | `optimize_itinerary`      | Route/time optimizer       |
|             | `get_user_itineraries`    | List itineraries           |
|             | `get_itinerary_details`   | Itinerary detail           |
| Gamification| `get_user_progress`       | Points/levels              |
|             | `unlock_reward`           | Redeem reward              |

---

## ⚙️ Environment Variables (`.dev.vars.example`)

```sh
# ---------------- Required ----------------
DB_URL="file:./local.db"

# -------------- Optional Keys --------------
GOOGLE_MAPS_API_KEY=""
FREE_CURRENCY_API_KEY=""
BETTER_AUTH_SECRET=""

# -------------- Development ---------------
NODE_ENV="development"
DEBUG="true"
```

---

## 📖 Contributing

```sh
git checkout -b feature/amazing-feature
npm run lint && npm run type-check
git commit -m "Add amazing feature"
git push origin feature/amazing-feature
# open PR
```

---

## 📄 License

MIT — see **LICENSE**.

---

**Built with ❤️ for the Vibe Summer Challenge 2025**  

**Demo Video URL** :: https://drive.google.com/drive/folders/1_xjZcIVCSt5ZB9I2UmvN1YusxnDJO3pq?usp=sharing
