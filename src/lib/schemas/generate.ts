import * as Automerge from "npm:@automerge/automerge";
import type { Index } from "./types.ts";

async function exportSchema<T>(name: string, init: (doc: T) => void) {
  const doc = Automerge.init<T>({
    actor: "init"
      .split("")
      .map((x) => x.charCodeAt(0).toString(16))
      .join(""),
  });
  const initDoc = Automerge.change(doc, init);
  const initDocData = Automerge.save(initDoc);
  await Deno.writeFile(`./src/lib/schemas/${name}.bin`, initDocData);
}

exportSchema<Index>("index", (doc) => {
  doc.dms = {};
});
