#!/usr/bin/env node
import { runCli } from "./index.js";

runCli(process.argv).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
