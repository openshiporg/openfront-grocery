export function getMcpDisabledResponse(): Response | null {
  if (process.env.MCP_ENABLED === 'true') return null;
  return new Response('Not found', { status: 404 });
}
