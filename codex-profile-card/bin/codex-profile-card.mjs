#!/usr/bin/env node

import { runCli } from "../src/codex-profile-card.mjs";

runCli().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
