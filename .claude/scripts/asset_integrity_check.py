"""
Asset integrity check -- compares on-disk bytes of critical assets against
what's actually committed in git HEAD. Catches silent substitution (a file
changed on disk without going through a commit) regardless of cause --
OneDrive sync, another tool, a stray script, manual edit, whatever.

Simple by design (per explicit instruction: no complex watcher/system
needed if a one-shot check is enough). Run it any time you want to confirm
nothing under img/ (or another watched path) has drifted from what's
actually in git:

    python .claude/scripts/asset_integrity_check.py

Exit code 0 = everything matches HEAD. Exit code 1 = at least one tracked
file's on-disk content differs from what's committed (does NOT mean
malicious -- could just be your own uncommitted edit in progress; read the
diff before assuming anything).
"""
import subprocess, sys, os

# Critical, rarely-should-change assets. Add paths here if you want them
# watched too -- this list is deliberately small and curated, not "all files".
WATCHED = [
    "img/hero/hero2.png",
    "img/hero/hero2.webp",
    "img/hero/category-arabe.jpg",
    "img/hero/category-designer.jpg",
    "img/logo-mark.png",
    "img/favicon-32.png",
    "img/apple-touch-icon.png",
    "assets/data.js",
    "assets/styles.css",
    "assets/app.js",
    "sw.js",
]

def git_blob_hash(path):
    try:
        out = subprocess.run(["git", "cat-file", "-p", f"HEAD:{path}"],
                              capture_output=True, check=True)
        return out.stdout
    except subprocess.CalledProcessError:
        return None  # not tracked, or not present at HEAD

def main():
    mismatches = []
    for rel in WATCHED:
        committed = git_blob_hash(rel)
        on_disk = None
        if os.path.exists(rel):
            with open(rel, "rb") as f:
                on_disk = f.read()
        if committed is None and on_disk is None:
            continue  # neither exists, fine
        if committed is None:
            mismatches.append((rel, "untracked / not in HEAD", len(on_disk) if on_disk else 0, "-"))
        elif on_disk is None:
            mismatches.append((rel, "MISSING from disk", 0, len(committed)))
        elif committed != on_disk:
            mismatches.append((rel, "CONTENT DIFFERS from HEAD", len(on_disk), len(committed)))
    if not mismatches:
        print("OK -- all", len(WATCHED), "watched assets match git HEAD exactly.")
        return 0
    print(f"{len(mismatches)} mismatch(es) found:\n")
    for rel, status, disk_size, head_size in mismatches:
        print(f"  {rel}\n    status: {status}\n    on-disk: {disk_size} bytes | HEAD: {head_size} bytes\n")
    return 1

if __name__ == "__main__":
    sys.exit(main())
