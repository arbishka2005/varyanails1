import { config } from "../config.js";
import { fileRepository } from "./fileRepository.js";
import * as postgresRepository from "./appRepository.js";
import type { Repository } from "./types.js";

export const repository: Repository =
  config.storageDriver === "postgres" ? postgresRepository : fileRepository;
