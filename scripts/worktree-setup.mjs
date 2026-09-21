import fs from "node:fs";
import path from "node:path";

const src = process.env.PASEO_SOURCE_CHECKOUT_PATH;
if (!src) {
  console.error("PASEO_SOURCE_CHECKOUT_PATH is not set; nothing to copy.");
  process.exit(1);
}

for (const name of [".agents", ".claude", "AGENTS.md"]) {
  const from = path.join(src, name);
  if (!fs.existsSync(from)) {
    console.log(`skip ${name} (not found in source checkout)`);
    continue;
  }
  fs.cpSync(from, name, { recursive: true, force: true });
  console.log(`copied ${name}`);
}
