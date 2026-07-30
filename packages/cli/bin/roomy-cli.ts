#!/usr/bin/env node
import { program } from "../src/cli.js";
program.parseAsync(process.argv).catch((error: Error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(2);
});
