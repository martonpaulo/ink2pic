# Ink2Pic

Write a word by hand on your Supernote, lasso it, and insert a matching picture from Openclipart or Wikimedia Commons. Keyless, no phone needed.

[![Validate](https://img.shields.io/github/actions/workflow/status/martonpaulo/ink2pic/validate.yml?branch=main&style=flat&labelColor=30363d&label=validate)](https://github.com/martonpaulo/ink2pic/actions/workflows/validate.yml)
[![License](https://img.shields.io/badge/license-MIT-0a66c8?style=flat&labelColor=30363d)](LICENSE)

[![Supernote Manta](https://img.shields.io/badge/Supernote-Manta-0a66c8?style=flat&labelColor=30363d)](https://supernote.com/)
[![Firmware 3.31.45](https://img.shields.io/badge/firmware-3.31.45-0a66c8?style=flat&labelColor=30363d)](https://support.supernote.com/changelog-for-manta-and-nomad)

> [!NOTE]
> Ink2Pic is in early development. There is no installable build yet.

## Why Ink2Pic

You study on your Supernote and want a picture of **a real thing** on the page: soup, a tree, a
historical person. Ink2Pic finds one **from inside the note**. Write the word, lasso it, tap
**Find picture**, and choose. The picture is **already converted for the e-ink screen**.

## Requirements

- A Supernote Manta with firmware Chauvet 3.31.45 or newer.
- Internet access on the device, to search.

## Install

1. Download `Ink2Pic.snplg` from the latest release (none yet).
2. Copy it to the `MyStyle` folder of the Supernote, with USB, Browse & Access, the Supernote
   Partner app or Supernote Cloud.
3. On the device, open Settings > Apps > Plugins > Add Plugin and pick the file.

## Use it

1. Write a word in English in a note.
2. Circle it with the lasso.
3. Tap Find picture and choose one.

## Permissions

| Permission | Why |
| :--- | :--- |
| Internet | To search Openclipart and Wikimedia Commons. |
| Files: read and write | To save the pictures you insert in `MyStyle/Ink2Pic`, so they work offline. |

## Privacy

Ink2Pic sends only the search word to Openclipart and Wikimedia Commons. It has no account, no
server and no analytics. Your notes never leave the device.

## Limitations

- English search words only.
- Manta only for now.

## For developers

Setup, commands and the device test protocol are in [`CONTRIBUTING.md`](CONTRIBUTING.md). The
product definition and the technical brief are in [`docs/`](docs/).

## License and credits

[MIT](LICENSE) © 2026 Marton Paulo.

Pictures come from Openclipart (CC0) and Wikimedia Commons (license per file, saved with each
picture).
