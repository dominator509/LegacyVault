import type { NextRequest } from "next/server";
import { proxyApiRequest } from "../../../_lib/proxy";

type Context = { params: Promise<{ path: string[] }> };
async function handler(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxyApiRequest(
    request,
    `/api/auth/${path.map(encodeURIComponent).join("/")}`,
  );
}
export const GET = handler;
export const POST = handler;
