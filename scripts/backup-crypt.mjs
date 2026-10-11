/**
 * Encrypt, verify and restore a Production backup folder (the output of
 * scripts/backup-production-db.mjs) as ONE authenticated, encrypted file that is safe to copy to an off-site
 * location the operator controls.
 *
 *   CRUZIAL_BACKUP_PASSPHRASE=... node scripts/backup-crypt.mjs encrypt --backup-dir <dir> --output <file.crzbk>
 *   CRUZIAL_BACKUP_PASSPHRASE=... node scripts/backup-crypt.mjs verify  --file <file.crzbk>
 *   CRUZIAL_BACKUP_PASSPHRASE=... node scripts/backup-crypt.mjs decrypt --file <file.crzbk> --output-dir <new-or-empty-dir>
 *
 * Design (Node standard library only, no new dependency):
 *   - AES-256-GCM; the key comes from scrypt(passphrase, random 16-byte salt). The magic/version header is
 *     authenticated as AAD, so any change to the file (header or body) fails decryption.
 *   - The passphrase is read ONLY from CRUZIAL_BACKUP_PASSPHRASE (never from argv, so it is not in the process
 *     list or shell history) and must be at least 20 characters. It is never printed.
 *   - `verify` decrypts in memory and recomputes the SHA-256 of every file against the embedded
 *     checksums.sha256; it prints file names, sizes and OK/FAIL only, never a row of data.
 *   - `encrypt` refuses to write inside the repository; `decrypt` refuses a non-empty directory and one inside
 *     the repository, and never overwrites a file.
 *   - The whole bundle is held in memory (the current dump is ~2 MB); revisit with streaming above ~500 MB.
 *
 * Losing the passphrase makes the backup unrecoverable. Keep it in the operator's password manager, never in
 * this repository, chat, CI or the same location as the encrypted file.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MAGIC = Buffer.from("CRZBK1\n", "utf8");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MIN_PASSPHRASE = 20;
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const EXPECTED_FILES = ["checksums.sha256", "data.sql", "roles.sql", "schema.sql"];
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export function assertPassphrase(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`CRUZIAL_BACKUP_PASSPHRASE must be set and at least ${MIN_PASSPHRASE} characters.`);
  }
}

function deriveKey(passphrase, salt) {
  return scryptSync(passphrase, salt, 32, SCRYPT);
}

/** files: [{ name, data: Buffer }] -> encrypted Buffer. */
export function encryptBundle(files, passphrase) {
  assertPassphrase(passphrase);
  const header = Buffer.from(JSON.stringify({ files: files.map((f) => ({ name: f.name, size: f.data.length })) }), "utf8");
  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32BE(header.length);
  const plaintext = Buffer.concat([lengthPrefix, header, ...files.map((f) => f.data)]);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, body, cipher.getAuthTag()]);
}

/** Encrypted Buffer -> [{ name, data }]. Throws on a wrong passphrase or any modification. */
export function decryptBundle(encrypted, passphrase) {
  assertPassphrase(passphrase);
  const min = MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES + 4;
  if (encrypted.length < min || !encrypted.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Not a Cruzial encrypted backup (bad magic).");
  }
  let offset = MAGIC.length;
  const salt = encrypted.subarray(offset, (offset += SALT_BYTES));
  const iv = encrypted.subarray(offset, (offset += IV_BYTES));
  const tag = encrypted.subarray(encrypted.length - TAG_BYTES);
  const body = encrypted.subarray(offset, encrypted.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new Error("Decryption failed: wrong passphrase or the file was modified.");
  }
  const headerLength = plaintext.readUInt32BE(0);
  const header = JSON.parse(plaintext.subarray(4, 4 + headerLength).toString("utf8"));
  let cursor = 4 + headerLength;
  return header.files.map((f) => {
    const data = plaintext.subarray(cursor, (cursor += f.size));
    return { name: f.name, data: Buffer.from(data) };
  });
}

/** Parses `<sha256>  <name>` lines (sha256sum format). */
export function parseChecksums(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (m) map.set(m[2].trim(), m[1].toLowerCase());
  }
  return map;
}

/** Compares every file with the embedded manifest. Returns [{ name, size, ok, reason? }]. */
export function verifyBundle(files) {
  const manifestFile = files.find((f) => f.name === "checksums.sha256");
  if (!manifestFile) return [{ name: "checksums.sha256", size: 0, ok: false, reason: "manifest missing" }];
  const expected = parseChecksums(manifestFile.data.toString("utf8"));
  const results = files
    .filter((f) => f.name !== "checksums.sha256")
    .map((f) => {
      const actual = createHash("sha256").update(f.data).digest("hex");
      const want = expected.get(f.name);
      return { name: f.name, size: f.data.length, ok: want === actual, ...(want ? {} : { reason: "not in manifest" }) };
    });
  for (const name of expected.keys()) {
    if (!files.some((f) => f.name === name)) results.push({ name, size: 0, ok: false, reason: "listed but missing" });
  }
  return results;
}

function insideRepository(path) {
  const rel = relative(repositoryRoot, resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function readBackupDir(dir) {
  const names = readdirSync(dir).sort();
  const unexpected = names.filter((n) => !EXPECTED_FILES.includes(n));
  const missing = EXPECTED_FILES.filter((n) => !names.includes(n));
  if (unexpected.length || missing.length) {
    throw new Error(`Backup folder must contain exactly ${EXPECTED_FILES.join(", ")} (missing: ${missing.join(",") || "-"}; unexpected: ${unexpected.join(",") || "-"}).`);
  }
  return names.map((name) => ({ name, data: readFileSync(join(dir, name)) }));
}

function readArg(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}

function requireAbsolute(value, flag) {
  if (!value || !isAbsolute(value)) throw new Error(`${flag} is required and must be an absolute path.`);
  return resolve(value);
}

function printResults(results) {
  for (const r of results) console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name} (${r.size} bytes)${r.reason ? ` - ${r.reason}` : ""}`);
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const [command] = argv;
  const passphrase = env.CRUZIAL_BACKUP_PASSPHRASE;
  if (command === "encrypt") {
    const dir = requireAbsolute(readArg(argv, "--backup-dir"), "--backup-dir");
    const output = requireAbsolute(readArg(argv, "--output"), "--output");
    if (insideRepository(output)) throw new Error("Refusing to write the encrypted backup inside the repository.");
    if (existsSync(output)) throw new Error("Refusing to overwrite an existing file.");
    const files = readBackupDir(dir);
    const before = verifyBundle(files);
    if (before.some((r) => !r.ok)) {
      printResults(before);
      throw new Error("The source backup does not match its own checksums.sha256; not encrypting a corrupt backup.");
    }
    const encrypted = encryptBundle(files, passphrase);
    writeFileSync(output, encrypted, { flag: "wx", mode: 0o600 });
    const roundTrip = verifyBundle(decryptBundle(readFileSync(output), passphrase));
    if (roundTrip.some((r) => !r.ok)) throw new Error("Round-trip verification failed; discard the output file.");
    console.log(`Encrypted ${files.length} files -> ${basename(output)} (${encrypted.length} bytes). Round-trip verified.`);
    console.log(`SHA-256 of the encrypted file: ${createHash("sha256").update(encrypted).digest("hex")}`);
    return 0;
  }
  if (command === "verify") {
    const file = requireAbsolute(readArg(argv, "--file"), "--file");
    const results = verifyBundle(decryptBundle(readFileSync(file), passphrase));
    printResults(results);
    return results.every((r) => r.ok) ? 0 : 1;
  }
  if (command === "decrypt") {
    const file = requireAbsolute(readArg(argv, "--file"), "--file");
    const outDir = requireAbsolute(readArg(argv, "--output-dir"), "--output-dir");
    if (insideRepository(outDir)) throw new Error("Refusing to restore a backup inside the repository.");
    if (existsSync(outDir) && (!statSync(outDir).isDirectory() || readdirSync(outDir).length > 0)) {
      throw new Error("--output-dir must not exist yet or must be an empty directory.");
    }
    const files = decryptBundle(readFileSync(file), passphrase);
    const results = verifyBundle(files);
    if (results.some((r) => !r.ok)) {
      printResults(results);
      throw new Error("Checksum mismatch after decryption; nothing was written.");
    }
    mkdirSync(outDir, { recursive: true });
    for (const f of files) writeFileSync(join(outDir, basename(f.name)), f.data, { flag: "wx", mode: 0o600 });
    console.log(`Restored ${files.length} verified files to ${outDir}.`);
    return 0;
  }
  throw new Error("Usage: node scripts/backup-crypt.mjs <encrypt|verify|decrypt> ... (passphrase in CRUZIAL_BACKUP_PASSPHRASE)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`[backup-crypt] ${error.message}`);
    process.exit(1);
  }
}
