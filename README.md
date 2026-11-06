# Ink2Pic

Write a word by hand on your Supernote, lasso it, and insert a matching picture from Openclipart or Wikimedia Commons. Keyless, no phone needed.

**[Download a test build](https://github.com/martonpaulo/ink2pic/releases)**

[![Validate](https://img.shields.io/github/actions/workflow/status/martonpaulo/ink2pic/validate.yml?branch=main&style=flat&labelColor=30363d&label=validate)](https://github.com/martonpaulo/ink2pic/actions/workflows/validate.yml)
[![License](https://img.shields.io/badge/license-MIT-0a66c8?style=flat&labelColor=30363d)](LICENSE)

[![Supernote Manta](https://img.shields.io/badge/Supernote-Manta-0a66c8?style=flat&labelColor=30363d)](https://supernote.com/)
[![Firmware 3.31.45](https://img.shields.io/badge/firmware-3.31.45-0a66c8?style=flat&labelColor=30363d)](https://support.supernote.com/changelog-for-manta-and-nomad)

> [!NOTE]
> Ink2Pic is in development. The only builds are **test builds** (GitHub prereleases). There is no
> stable release yet.

## Why Ink2Pic

Ink2Pic is a **Supernote plugin** that lets you **insert an image** into a note from your
**handwriting**. You study on your Supernote and want a picture of **a real thing** on the page:
soup, a tree, a historical person. Write the word, lasso it, tap **Find picture**, and choose.
Ink2Pic searches **clip art** on Openclipart and pictures on Wikimedia Commons, and adds the one you
choose to the page. The picture is **already converted for the e-ink screen**. You need no account,
no key and no phone to **add a picture** this way.

## Requirements

- A Supernote Manta with firmware Chauvet 3.31.45 or newer.
- Internet access on the device, to search.

Ink2Pic is built with `sn-plugin-lib` 0.2.3 and is tested on the Manta only. The Supernote Nomad is
not tested.

## Install

Each test build is a GitHub prerelease named `v0.1.0-dev.<number>`, with the file `Ink2Pic.snplg`
attached.

1. Open the [releases page](https://github.com/martonpaulo/ink2pic/releases) and download
   `Ink2Pic.snplg` from the newest prerelease.
2. Copy the file to the `MyStyle` folder of your Manta, with USB, Browse & Access, the Supernote
   Partner app or Supernote Cloud.
3. On the device, open Settings > Apps > Plugins > Add Plugin and pick the new file.
4. When the release notes say a build changes native code, restart the device after the update.

## Use it

1. Write a word in English in a note.
2. Circle it with the lasso.
3. Tap Find picture and choose one.

## Permissions and data sent

Ink2Pic asks for two permissions.

| Permission | Why |
| :--- | :--- |
| Internet | To search Openclipart and Wikimedia Commons. |
| Files: read and write | To save the pictures you insert in `MyStyle/Ink2Pic/library/`, so they work offline, and to read the page size. |

Ink2Pic sends only the searched word, and only to Openclipart and Wikimedia Commons. It has no
account, no server and no analytics. Your notes never leave the device.

## Image sources and licenses

Every picture comes from one of two sites. Ink2Pic saves the license with each picture.

| Source | License |
| :--- | :--- |
| [Openclipart](https://openclipart.org/) | CC0 |
| [Wikimedia Commons](https://commons.wikimedia.org/) | The license of each file, saved with the picture |

## Status

Ink2Pic is in development. Test builds come out as GitHub prereleases. There is no stable release
yet.

## Limitations

- English search words only.
- Tested on the Manta only; the Nomad is not tested.

## For developers

Setup, commands and the device test protocol are in [`CONTRIBUTING.md`](CONTRIBUTING.md). The
product definition and the technical brief are in [`docs/`](docs/).

## License and credits

[MIT](LICENSE) © 2026 Marton Paulo.

Pictures come from Openclipart (CC0) and Wikimedia Commons (license per file, saved with each
picture).
