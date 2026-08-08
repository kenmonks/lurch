# Lurch Notation Highlighting (VS Code)

A two-file VS Code extension that makes `lurch-notation.txt` auto-detect as
its own language and highlight using the Peggy TextMate grammar — WITHOUT
attaching the Peggy extension's language server, so the file gets Peggy's
colors but none of its (inapplicable) syntax-error squiggles.

How it works: it declares a `lurch-notation` language claimed by the
filename `lurch-notation.txt`, whose grammar is a one-line include of
`source.peggy`. The Peggy extension's language server only attaches to
documents with language id `peggy`, so it never sees this file.

Requires: the "Peggy Language" extension (`peggyjs.peggy-language`) must be
installed — it supplies the `source.peggy` grammar this one includes. If it
is missing, the file simply renders unhighlighted (no errors).

## Install

Symlink (or copy) this folder into your VS Code extensions directory and
restart VS Code:

```sh
ln -s "$(pwd)/vscode-lurch-notation" ~/.vscode/extensions/lurch-notation-highlighting
```

To uninstall, remove the symlink.

## Fallback

If you prefer not to sideload an extension, one line of settings gets the
auto-detection (but keeps the error squiggles, since the real Peggy
language attaches):

```json
"files.associations": { "lurch-notation.txt": "peggy" }
```
