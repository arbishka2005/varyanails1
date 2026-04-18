import type express from "express";
import type { CommandResult } from "../services/bookingCommands.js";

export function getErrorCode(status: number) {
  if (status === 400) {
    return "VALIDATION_ERROR";
  }

  if (status === 401 || status === 403) {
    return "AUTH_ERROR";
  }

  if (status === 404) {
    return "NOT_FOUND";
  }

  if (status === 409) {
    return "CONFLICT";
  }

  if (status === 413) {
    return "PAYLOAD_TOO_LARGE";
  }

  return status >= 500 ? "SERVER_ERROR" : "HTTP_ERROR";
}

export function sendError(response: express.Response, status: number, error: string) {
  response.status(status).json({ error, code: getErrorCode(status) });
}

export function sendCommandResult<T>(response: express.Response, result: CommandResult<T>) {
  if (!result.ok) {
    sendError(response, result.status, result.error);
    return;
  }

  if (result.status === 204) {
    response.status(204).end();
    return;
  }

  response.status(result.status).json(result.data);
}
