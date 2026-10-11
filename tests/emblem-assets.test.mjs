import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
test("gli emblemi ritirati non vengono più assegnati né pubblicati", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  for (const name of ["sets", "comeback", "dominator"]) {
    assert.ok(!page.includes(`recordBadge("${name}"`));
    await assert.rejects(access(new URL(`public/emblems/${name}.webp`, root)), { code: "ENOENT" });
  }
});
test("tutti gli emblemi rimasti hanno un asset WebP locale", async () => {
  for (const name of ["goat", "goat-slayer", "summit", "flame", "turkey", "hook", "marathon", "centurion", "duo", "mvp"]) {
    const image = await readFile(new URL(`public/emblems/${name}.webp`, root));
    assert.equal(image.toString("ascii", 0, 4), "RIFF", name);
    assert.equal(image.toString("ascii", 8, 12), "WEBP", name);
  }
});
