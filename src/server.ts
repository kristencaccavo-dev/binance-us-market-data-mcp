import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const BINANCE_BASE = "https://api.binance.us";

async function binance(
  path: string,
  params: Record<string, string | number | undefined> = {}
) {
  const url = new URL(`${BINANCE_BASE}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Binance.US returned ${response.status}: ${text}`
    );
  }

  return JSON.parse(text);
}

function success(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data),
      },
    ],
  };
}

function failure(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          error instanceof Error
            ? `Error: ${error.message}`
            : "Unknown error",
      },
    ],
    isError: true,
  };
}

function createServer() {
  const server = new McpServer({
    name: "Binance.US Market Data",
    version: "1.0.0",
  });

  server.registerTool(
    "getBinanceUSServerTime",
    {
      description:
        "Get the current Binance.US server time in milliseconds since the Unix epoch.",
      inputSchema: {},
    },
    async () => {
      try {
        return success(await binance("/api/v3/time"));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "verifyBinanceUSPair",
    {
      description:
        "Verify one exact Binance.US trading pair and return its trading status, base asset, quote asset, and spot eligibility.",
      inputSchema: {
        symbol: z
          .string()
          .describe(
            "Exact Binance.US symbol such as BTCUSD, ETHUSD, or SUIUSDT."
          ),
      },
    },
    async ({ symbol }) => {
      try {
        return success(
          await binance("/api/v3/exchangeInfo", {
            symbol,
          })
        );
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "getCryptoPrices",
    {
      description:
        "Get live Binance.US prices. Provide one symbol, a list of symbols, or omit both to return the compact full Binance.US price universe.",
      inputSchema: {
        symbol: z
          .string()
          .optional()
          .describe(
            "One exact Binance.US symbol. Do not use together with symbols."
          ),
        symbols: z
          .array(z.string())
          .optional()
          .describe(
            "List of exact Binance.US symbols. Do not use together with symbol."
          ),
      },
    },
    async ({ symbol, symbols }) => {
      try {
        if (symbol && symbols?.length) {
          throw new Error(
            "Use either symbol or symbols, not both."
          );
        }

        const params: Record<
          string,
          string | number | undefined
        > = {};

        if (symbol) {
          params.symbol = symbol;
        } else if (symbols?.length) {
          params.symbols = JSON.stringify(symbols);
        }

        return success(
          await binance("/api/v3/ticker/price", params)
        );
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "getCrypto24HourStatsBatch",
    {
      description:
        "Get Binance.US 24-hour statistics for an explicit batch of 1 to 15 symbols, including price change, volume, bid, ask, highs, lows, and trade count.",
      inputSchema: {
        symbols: z
          .array(z.string())
          .min(1)
          .max(15)
          .describe(
            "One to fifteen exact Binance.US symbols."
          ),
        type: z
          .enum(["FULL", "MINI"])
          .optional()
          .describe(
            "Use FULL for market screening. Defaults to FULL."
          ),
      },
    },
    async ({ symbols, type }) => {
      try {
        return success(
          await binance("/api/v3/ticker/24hr", {
            symbols: JSON.stringify(symbols),
            type: type ?? "FULL",
          })
        );
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "getCryptoCandles",
    {
      description:
        "Get recent Binance.US OHLCV candlestick data for one exact verified trading pair in chronological order.",
      inputSchema: {
        symbol: z
          .string()
          .describe(
            "Exact verified Binance.US trading pair."
          ),
        interval: z
          .enum([
            "1m",
            "3m",
            "5m",
            "15m",
            "30m",
            "1h",
            "2h",
            "4h",
            "6h",
            "8h",
            "12h",
            "1d",
            "3d",
            "1w",
          ])
          .describe("Candlestick interval."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe(
            "Number of recent candles. Defaults to 220."
          ),
      },
    },
    async ({ symbol, interval, limit }) => {
      try {
        return success(
          await binance("/api/v3/klines", {
            symbol,
            interval,
            limit: limit ?? 220,
          })
        );
      } catch (error) {
        return failure(error);
      }
    }
  );

  return server;
}

export default createMcpHandler(createServer);
