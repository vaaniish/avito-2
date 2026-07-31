import { stat } from "node:fs/promises";
import sharp from "sharp";

const names = ["slide-1", "slide-2", "slide-3", "slide-4"];
for (const name of names) {
  const input = `frontend/src/assets/hero/final/${name}.png`;
  const output = `frontend/src/assets/hero/final/${name}.webp`;
  await sharp(input)
    .webp({ quality: 82, effort: 6, preset: "picture", smartSubsample: true })
    .toFile(output);
  const [before, after] = await Promise.all([stat(input), stat(output)]);
  process.stdout.write(`[assets] ${name}: ${before.size} -> ${after.size} bytes\n`);
}
