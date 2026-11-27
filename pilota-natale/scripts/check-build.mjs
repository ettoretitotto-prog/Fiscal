// Blocca il deploy se la build di produzione contiene riferimenti agli emulatori.
import { readdirSync, readFileSync } from "node:fs";
const dir = new URL("../web/dist/assets/", import.meta.url);
const bad = readdirSync(dir).filter((f) => f.endsWith(".js") && readFileSync(new URL(f, dir), "utf8").includes(":9099"));
if (bad.length) {
  console.error(`✗ La build punta agli emulatori (${bad.join(", ")}). Non fare il deploy.`);
  process.exit(1);
}
console.log("✓ Build di produzione senza emulatori");
