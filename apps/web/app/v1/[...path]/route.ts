import type { NextRequest } from "next/server";
import { proxyApiRequest } from "../../_lib/proxy";

type Context = { params: Promise<{ path: string[] }> };
async function handler(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxyApiRequest(
    request,
    `/v1/${path.map(encodeURIComponent).join("/")}`,
  );
}
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
