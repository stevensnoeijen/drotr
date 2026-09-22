# Raw

**Status: temporary, being phased out.** This directory used to be packed
into `public/assets` by a `gulp` pipeline (`pack-sounds`/`pack-sprites`
tasks); that pipeline was removed and is not being restored. The plan is to
generate assets/tiles/sprites directly from the original game data in
`.cd/` instead — see [docs/ASSETS.md](../docs/ASSETS.md). Files here are
kept only as a reference during that transition and will be removed
incrementally as the `.cd`-based generation replaces each part of it.
