/** Office Hub over MCP, as one role (its agent token). Stateless server: one short connection per call. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export class HubError extends Error {}

export interface Hub {
  call(tool: string, args: Record<string, unknown>): Promise<any>;
}

export function hubFor(mcpUrl: string, token: string): Hub {
  return {
    async call(tool, args) {
      const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      });
      const client = new Client({ name: "officehub-agent-runner", version: "0.1.0" });
      await client.connect(transport);
      try {
        const r: any = await client.callTool({ name: tool, arguments: args });
        const texts = (r.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text as string);
        const last = texts[texts.length - 1] ?? "{}";
        let data: any;
        try {
          data = JSON.parse(last);
        } catch {
          data = { text: last };
        }
        if (r.isError) throw new HubError(`${tool}: ${data?.error?.code ?? "error"} ${data?.error?.message ?? ""}`.trim());
        return data;
      } finally {
        await client.close().catch(() => {});
      }
    },
  };
}
