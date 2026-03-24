#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import YahooFinance from "yahoo-finance2";

// Suppress survey notice that pollutes stdout (MCP protocol channel)
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const server = new McpServer({
  name: "yahoo-finance",
  version: "1.0.0",
});

// Format error as MCP tool error response
function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

// ── get_quote ───────────────────────────────────────────────────────────────

server.tool(
  "get_quote",
  "Get real-time quote for one or more symbols (price, change, volume, market cap)",
  { symbols: z.array(z.string()).describe("Ticker symbols, e.g. ['AAPL', 'MSFT']") },
  async ({ symbols }) => {
    try {
      const quotes = await yahooFinance.quote(symbols);
      const results = (Array.isArray(quotes) ? quotes : [quotes]).map((q) => ({
        symbol: q.symbol,
        name: q.shortName ?? q.longName,
        price: q.regularMarketPrice,
        change: q.regularMarketChange,
        changePercent: q.regularMarketChangePercent,
        volume: q.regularMarketVolume,
        marketCap: q.marketCap,
        currency: q.currency,
        exchange: q.fullExchangeName,
      }));
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ── get_historical ──────────────────────────────────────────────────────────

server.tool(
  "get_historical",
  "Get historical OHLCV data for a symbol with configurable period and interval",
  {
    symbol: z.string().describe("Ticker symbol, e.g. 'AAPL'"),
    period1: z.string().describe("Start date in YYYY-MM-DD format"),
    period2: z.string().optional().describe("End date in YYYY-MM-DD format (defaults to today)"),
    interval: z
      .enum(["1d", "1wk", "1mo", "5m", "15m", "30m", "60m", "1h"])
      .default("1d")
      .describe("Data interval"),
  },
  async ({ symbol, period1, period2, interval }) => {
    try {
      const chart = await yahooFinance.chart(symbol, {
        period1,
        period2: period2 ?? new Date().toISOString().split("T")[0],
        interval,
      });
      const data = chart.quotes.map((q) => ({
        date: q.date,
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume,
      }));
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ── get_earnings ────────────────────────────────────────────────────────────

server.tool(
  "get_earnings",
  "Get earnings history and estimates for a symbol",
  { symbol: z.string().describe("Ticker symbol, e.g. 'AAPL'") },
  async ({ symbol }) => {
    try {
      const summary = await yahooFinance.quoteSummary(symbol, {
        modules: ["earnings", "earningsHistory", "earningsTrend"],
      });
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ── get_news ────────────────────────────────────────────────────────────────

server.tool(
  "get_news",
  "Get recent news articles for a symbol",
  {
    symbol: z.string().describe("Ticker symbol, e.g. 'AAPL'"),
    count: z.number().default(10).describe("Number of news articles to return"),
  },
  async ({ symbol, count }) => {
    try {
      const results = await yahooFinance.search(symbol, {
        newsCount: count,
        quotesCount: 0,
      });
      const news = results.news.map((article) => ({
        title: article.title,
        publisher: article.publisher,
        link: article.link,
        publishedAt: article.providerPublishTime,
      }));
      return { content: [{ type: "text", text: JSON.stringify(news, null, 2) }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ── get_financials ──────────────────────────────────────────────────────────

server.tool(
  "get_financials",
  "Get income statement, balance sheet, or cash flow data (annual or quarterly)",
  {
    symbol: z.string().describe("Ticker symbol, e.g. 'AAPL'"),
    module: z
      .enum(["financials", "balance-sheet", "cash-flow", "all"])
      .default("financials")
      .describe("Financial statement type"),
    type: z
      .enum(["annual", "quarterly", "trailing"])
      .default("annual")
      .describe("Reporting period"),
    period1: z.string().default("2020-01-01").describe("Start date in YYYY-MM-DD format"),
  },
  async ({ symbol, module, type, period1 }) => {
    try {
      const data = await yahooFinance.fundamentalsTimeSeries(symbol, {
        period1,
        type,
        module,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ── get_profile ─────────────────────────────────────────────────────────────

server.tool(
  "get_profile",
  "Get company profile including sector, industry, description, and website",
  { symbol: z.string().describe("Ticker symbol, e.g. 'AAPL'") },
  async ({ symbol }) => {
    try {
      const summary = await yahooFinance.quoteSummary(symbol, {
        modules: ["assetProfile", "summaryProfile"],
      });
      const profile = summary.assetProfile;
      const result = {
        sector: profile?.sector,
        industry: profile?.industry,
        website: profile?.website,
        description: profile?.longBusinessSummary,
        fullTimeEmployees: profile?.fullTimeEmployees,
        city: profile?.city,
        state: profile?.state,
        country: profile?.country,
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ── search ──────────────────────────────────────────────────────────────────

server.tool(
  "search",
  "Search for symbols by keyword (company name, ticker, etc.)",
  {
    query: z.string().describe("Search query, e.g. 'artificial intelligence' or 'AAPL'"),
    count: z.number().default(10).describe("Maximum number of results"),
  },
  async ({ query, count }) => {
    try {
      const results = await yahooFinance.search(query, {
        quotesCount: count,
        newsCount: 0,
        enableFuzzyQuery: true,
      });
      const quotes = results.quotes
        .filter((q): q is typeof q & { isYahooFinance: true } => "isYahooFinance" in q && (q as any).isYahooFinance)
        .map((q) => ({
          symbol: q.symbol,
          name: q.shortname,
          type: q.quoteType,
          exchange: q.exchange,
        }));
      return { content: [{ type: "text", text: JSON.stringify(quotes, null, 2) }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ── Server startup ──────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Yahoo Finance MCP server running on stdio");
}

// Clean shutdown when parent process disconnects
process.stdin.on("close", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
