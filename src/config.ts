import { config as loadEnv } from "dotenv";
import { z } from "zod";

import { configSchema } from "./tools";

export type EnvConfig = z.infer<typeof configSchema>;

let cachedConfig: EnvConfig | null = null;

loadEnv();

export function getEnvConfig(): EnvConfig {
  if (!cachedConfig) {
    cachedConfig = configSchema.parse({
      email: process.env.MONARCH_EMAIL,
      password: process.env.MONARCH_PASSWORD,
      mfaSecret: process.env.MONARCH_MFA_SECRET,
    });
  }

  return cachedConfig;
}
