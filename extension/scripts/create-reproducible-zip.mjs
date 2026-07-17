import { createWriteStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ZipFile } from "yazl";

const target = process.argv[2];
const targets = {
  chrome: ["chrome-mv3", "shieldme-extension-1.0.0-chrome.zip"],
  firefox: ["firefox-mv2", "shieldme-extension-1.0.0-firefox.zip"],
};

if (!(target in targets)) {
  throw new Error("Expected target to be chrome or firefox");
}

const [directory, archive] = targets[target];
const sourceDirectory = path.resolve(".output", directory);
const archivePath = path.resolve(".output", archive);
const fixedDate = new Date("2000-01-01T00:00:00.000Z");

async function listFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }),
  );
  return files.flat().sort();
}

const zip = new ZipFile();
for (const filePath of await listFiles(sourceDirectory)) {
  const metadata = await stat(filePath);
  zip.addBuffer(await readFile(filePath), path.relative(sourceDirectory, filePath), {
    mtime: fixedDate,
    mode: metadata.mode,
  });
}

await new Promise((resolve, reject) => {
  const output = createWriteStream(archivePath);
  output.on("close", resolve);
  output.on("error", reject);
  zip.outputStream.on("error", reject);
  zip.outputStream.pipe(output);
  zip.end();
});
