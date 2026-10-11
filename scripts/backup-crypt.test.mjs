// Run with: node --test scripts/backup-crypt.test.mjs
// Synthetic data only; temp directories live outside the repository. Never touches a database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertPassphrase, decryptBundle, encryptBundle, main, parseChecksums, verifyBundle } from "./backup-crypt.mjs";

const PASS = "correct horse battery staple 42";
const sha = (b) => createHash("sha256").update(b).digest("hex");

function syntheticFiles() {
  const data = {
    "roles.sql": Buffer.from("-- synthetic roles\n"),
    "schema.sql": Buffer.from("create table t(id int);\n"),
    "data.sql": Buffer.from("copy t from stdin;\n1\n\.\n"),
  };
  const manifest = Object.entries(data).map(([name, buf]) => `${sha(buf)}  ${name}`).join("\n") + "\n";
  return [...Object.entries(data).map(([name, buf]) => ({ name, data: buf })), { name: "checksums.sha256", data: Buffer.from(manifest) }];
}

function writeBackupDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "crz-bk-src-"));
  for (const f of files) writeFileSync(join(dir, f.name), f.data);
  return dir;
}

test("round-trips every file byte-for-byte", () => {
  const files = syntheticFiles();
  const back = decryptBundle(encryptBundle(files, PASS), PASS);
  assert.deepEqual(back.map((f) => f.name), files.map((f) => f.name));
  for (let i = 0; i < files.length; i++) assert.ok(back[i].data.equals(files[i].data));
});

test("the ciphertext contains no plaintext and differs per run (random salt/iv)", () => {
  const files = syntheticFiles();
  const a = encryptBundle(files, PASS);
  const b = encryptBundle(files, PASS);
  assert.ok(!a.includes(Buffer.from("create table")));
  assert.ok(!a.equals(b));
});

test("a wrong passphrase and any modified byte are rejected", () => {
  const enc = encryptBundle(syntheticFiles(), PASS);
  assert.throws(() => decryptBundle(enc, "another passphrase that is long"), /wrong passphrase or the file was modified/);
  for (const index of [3, 10, 30, Math.floor(enc.length / 2), enc.length - 1]) {
    const tampered = Buffer.from(enc);
    tampered[index] ^= 0x01;
    assert.throws(() => decryptBundle(tampered, PASS), /(wrong passphrase|bad magic)/, `byte ${index}`);
  }
  assert.throws(() => decryptBundle(enc.subarray(0, enc.length - 5), PASS));
});

test("a short or missing passphrase is refused before any work", () => {
  assert.throws(() => assertPassphrase(undefined), /at least 20/);
  assert.throws(() => assertPassphrase("short"), /at least 20/);
  assert.throws(() => encryptBundle(syntheticFiles(), "too short"), /at least 20/);
});

test("verifyBundle flags a corrupted file, an unlisted file and a missing manifest", () => {
  const files = syntheticFiles();
  assert.ok(verifyBundle(files).every((r) => r.ok));
  const corrupted = files.map((f) => (f.name === "data.sql" ? { ...f, data: Buffer.from("tampered") } : f));
  assert.equal(verifyBundle(corrupted).find((r) => r.name === "data.sql").ok, false);
  assert.equal(verifyBundle([...files, { name: "extra.sql", data: Buffer.from("x") }]).find((r) => r.name === "extra.sql").reason, "not in manifest");
  assert.equal(verifyBundle(files.filter((f) => f.name !== "checksums.sha256"))[0].ok, false);
  assert.equal(parseChecksums(`${"a".repeat(64)}  roles.sql\nnot a line\n`).get("roles.sql"), "a".repeat(64));
});

test("CLI: encrypt -> verify -> decrypt restores identical files, never overwrites, and keeps the passphrase out of argv", () => {
  const files = syntheticFiles();
  const src = writeBackupDir(files);
  const out = join(mkdtempSync(join(tmpdir(), "crz-bk-out-")), "backup.crzbk");
  const env = { CRUZIAL_BACKUP_PASSPHRASE: PASS };
  assert.equal(main(["encrypt", "--backup-dir", src, "--output", out], env), 0);
  assert.equal(main(["verify", "--file", out], env), 0);
  assert.throws(() => main(["encrypt", "--backup-dir", src, "--output", out], env), /overwrite/);
  const restoreDir = join(mkdtempSync(join(tmpdir(), "crz-bk-rest-")), "restored");
  assert.equal(main(["decrypt", "--file", out, "--output-dir", restoreDir], env), 0);
  for (const f of files) assert.ok(readFileSync(join(restoreDir, f.name)).equals(f.data));
  assert.throws(() => main(["decrypt", "--file", out, "--output-dir", restoreDir], env), /empty directory/);
  assert.throws(() => main(["verify", "--file", out], { CRUZIAL_BACKUP_PASSPHRASE: "wrong wrong wrong wrong wrong" }), /wrong passphrase/);
  assert.throws(() => main(["verify", "--file", out, "--passphrase", PASS], {}), /at least 20/);
});

test("CLI: refuses a corrupt source backup, an incomplete folder and any path inside the repository", () => {
  const files = syntheticFiles();
  const bad = writeBackupDir(files.map((f) => (f.name === "schema.sql" ? { ...f, data: Buffer.from("changed") } : f)));
  const out = join(mkdtempSync(join(tmpdir(), "crz-bk-out-")), "x.crzbk");
  const env = { CRUZIAL_BACKUP_PASSPHRASE: PASS };
  assert.throws(() => main(["encrypt", "--backup-dir", bad, "--output", out], env), /does not match its own checksums/);
  assert.equal(existsSync(out), false);
  const incomplete = writeBackupDir(files.filter((f) => f.name !== "roles.sql"));
  assert.throws(() => main(["encrypt", "--backup-dir", incomplete, "--output", out], env), /must contain exactly/);
  const good = writeBackupDir(files);
  assert.throws(() => main(["encrypt", "--backup-dir", good, "--output", join(process.cwd(), "inside.crzbk")], env), /inside the repository/);
  assert.throws(() => main(["encrypt", "--backup-dir", "relative/dir", "--output", out], env), /absolute/);
});
