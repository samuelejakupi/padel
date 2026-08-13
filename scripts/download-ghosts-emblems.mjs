import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const API_URL = "https://callofduty.fandom.com/api.php";
const CATEGORY = "Category:Call of Duty: Ghosts Emblem images";
const DEFAULT_OUTPUT = "downloads/ghosts-emblems";
const USER_AGENT = "TheBoyz emblem downloader/1.0 (personal archival script)";

function usage() {
  console.log(`Scarica le immagini originali dalla categoria:
${CATEGORY}

Uso:
  node scripts/download-ghosts-emblems.mjs [opzioni]

Opzioni:
  --output, -o <cartella>  Cartella di destinazione (default: ${DEFAULT_OUTPUT})
  --concurrency, -c <n>   Download simultanei, da 1 a 10 (default: 4)
  --overwrite             Riscarica anche i file gia presenti
  --dry-run               Elenca i file senza scaricarli
  --help, -h              Mostra questo aiuto
`);
}

function readOptions(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    concurrency: 4,
    overwrite: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      usage();
      process.exit(0);
    }
    if (argument === "--overwrite") {
      options.overwrite = true;
      continue;
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--output" || argument === "-o") {
      options.output = argv[index + 1];
      index += 1;
      if (!options.output) throw new Error("Manca la cartella dopo --output.");
      continue;
    }
    if (argument === "--concurrency" || argument === "-c") {
      options.concurrency = Number(argv[index + 1]);
      index += 1;
      if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 10) {
        throw new Error("--concurrency deve essere un numero intero fra 1 e 10.");
      }
      continue;
    }
    throw new Error(`Opzione sconosciuta: ${argument}`);
  }

  return options;
}

function apiUrl(parameters) {
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    ...parameters,
  }).toString();
  return url;
}

async function fetchWithRetry(url, { attempts = 4, binary = false } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: binary ? "image/*" : "application/json",
          "User-Agent": USER_AGENT,
        },
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((done) => setTimeout(done, attempt * 750));
    }
  }
  throw lastError;
}

async function listCategoryFiles() {
  const files = [];
  let continuation;

  do {
    const response = await fetchWithRetry(apiUrl({
      list: "categorymembers",
      cmtitle: CATEGORY,
      cmnamespace: "6",
      cmtype: "file",
      cmlimit: "500",
      ...(continuation ? { cmcontinue: continuation } : {}),
    }));
    const data = await response.json();
    if (data.error) throw new Error(data.error.info ?? "Errore API durante la lettura della categoria.");
    files.push(...(data.query?.categorymembers ?? []));
    continuation = data.continue?.cmcontinue;
    process.stdout.write(`\rTrovati ${files.length} file...`);
  } while (continuation);

  process.stdout.write("\n");
  return files;
}

async function resolveOriginalUrls(files) {
  const resolved = [];

  // MediaWiki accetta fino a 50 titoli per richiesta per gli utenti anonimi.
  for (let start = 0; start < files.length; start += 50) {
    const batch = files.slice(start, start + 50);
    const response = await fetchWithRetry(apiUrl({
      prop: "imageinfo",
      iiprop: "url|mime",
      titles: batch.map((file) => file.title).join("|"),
    }));
    const data = await response.json();
    if (data.error) throw new Error(data.error.info ?? "Errore API durante la lettura degli URL.");

    for (const page of data.query?.pages ?? []) {
      const image = page.imageinfo?.[0];
      if (image?.url) resolved.push({ title: page.title, url: image.url, mime: image.mime });
    }
    process.stdout.write(`\rRisolti ${Math.min(start + batch.length, files.length)}/${files.length} URL...`);
  }

  process.stdout.write("\n");
  return resolved;
}

function safeFilename(title, url) {
  const titleName = title.replace(/^File:/i, "").trim();
  const urlName = decodeURIComponent(basename(new URL(url).pathname));
  const extension = /\.[a-z0-9]{2,5}$/i.exec(urlName)?.[0] ?? "";
  const withExtension = /\.[a-z0-9]{2,5}$/i.test(titleName) ? titleName : `${titleName}${extension}`;
  return withExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 220);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }));
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  const output = resolve(options.output);

  console.log(`Categoria: ${CATEGORY}`);
  console.log(`Destinazione: ${output}`);

  const categoryFiles = await listCategoryFiles();
  const images = await resolveOriginalUrls(categoryFiles);
  const missingUrls = categoryFiles.length - images.length;

  if (options.dryRun) {
    images.forEach((image) => console.log(safeFilename(image.title, image.url)));
    console.log(`\n${images.length} immagini pronte. Nessun file scaricato (--dry-run).`);
    if (missingUrls) console.warn(`${missingUrls} file senza URL originale.`);
    return;
  }

  await mkdir(output, { recursive: true });
  let downloaded = 0;
  let skipped = 0;
  const failures = [];

  await runPool(images, options.concurrency, async (image) => {
    const filename = safeFilename(image.title, image.url);
    const destination = resolve(output, filename);
    if (!options.overwrite && await exists(destination)) {
      skipped += 1;
      process.stdout.write(`\rScaricate ${downloaded}, gia presenti ${skipped}, errori ${failures.length}...`);
      return;
    }

    try {
      const response = await fetchWithRetry(image.url, { binary: true });
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(destination, bytes);
      downloaded += 1;
    } catch (error) {
      failures.push({ title: image.title, url: image.url, error: String(error) });
    }
    process.stdout.write(`\rScaricate ${downloaded}, gia presenti ${skipped}, errori ${failures.length}...`);
  });

  process.stdout.write("\n");
  const manifest = {
    source: `https://callofduty.fandom.com/wiki/${encodeURIComponent(CATEGORY)}`,
    category: CATEGORY,
    generatedAt: new Date().toISOString(),
    totalInCategory: categoryFiles.length,
    resolved: images.length,
    downloaded,
    skipped,
    failures,
    files: images.map((image) => ({
      title: image.title,
      filename: safeFilename(image.title, image.url),
      originalUrl: image.url,
      mime: image.mime,
    })),
  };
  await writeFile(resolve(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Completato: ${downloaded} scaricate, ${skipped} gia presenti, ${failures.length} errori.`);
  console.log(`Manifest: ${resolve(output, "manifest.json")}`);
  if (missingUrls) console.warn(`${missingUrls} file della categoria non espongono un URL originale.`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Errore: ${error.message ?? error}`);
  process.exitCode = 1;
});
