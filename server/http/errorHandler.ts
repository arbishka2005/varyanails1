import type express from "express";
import { ZodError } from "zod";
import { DomainError } from "../lib/domainErrors.js";
import { getErrorCode } from "./respond.js";

export function errorHandler(
  error: unknown,
  _request: express.Request,
  response: express.Response,
  _next: express.NextFunction,
) {
  if (error instanceof ZodError) {
    response.status(400).json({ error: "Validation failed", code: getErrorCode(400), issues: error.issues });
    return;
  }

  if (error instanceof DomainError) {
    response.status(error.status).json({ error: error.message, code: getErrorCode(error.status) });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Internal server error", code: getErrorCode(500) });
}
