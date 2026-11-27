import "server-only";
import { CanvasClient } from "./client";
import { readCanvasConfig } from "./config";

export class CanvasNotConfiguredError extends Error {
  override readonly name = "CanvasNotConfiguredError";
}

export function getCanvasClient(): { client: CanvasClient; origin: string } {
  const config = readCanvasConfig();
  if (!config.ok) throw new CanvasNotConfiguredError("Canvas no está configurado");
  return { client: new CanvasClient({ baseUrl: config.baseUrl, token: config.token }), origin: new URL(config.baseUrl).origin };
}
