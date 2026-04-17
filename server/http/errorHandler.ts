import type express from "express";
import { ZodError } from "zod";

export function errorHandler(
  error: unknown,
  _request: express.Request,
  response: express.Response,
  _next: express.NextFunction,
) {
  if (error instanceof ZodError) {
    response.status(400).json({ error: "Validation failed", issues: error.issues });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Internal server error" });
}
