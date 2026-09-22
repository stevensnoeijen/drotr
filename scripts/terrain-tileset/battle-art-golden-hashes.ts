/**
 * SHA-256 of a handful of `ART/BATTLE.ART` tiles' decoded RGBA bytes,
 * colour key resolved to alpha.
 *
 * Recorded once here and shared by every spec that needs to pin real tile
 * pixels — `battle-art.spec.ts` (decoding straight off the atlas) and the
 * terrain tileset's committed-file spec (decoding the same tiles back out
 * of `public/maps/terrain.png`, where they carry the same ids for indices
 * 0–1471). Only hashes are recorded, never pixels, so nothing here
 * reproduces the original artwork.
 */
export const GOLDEN_TILE_HASHES: Readonly<Record<number, string>> = {
  0: 'c0c3eec3711770ced9bdb0bc3353c1145727831bfecbdc19f85df37b4b43fdee',
  1382: 'c7545eb0809edc9390b0d9fa372676df12eacc2ee3ede38c18ddd852a753045e',
  1459: '1481756c76a07bcc5d208ac184fd9f8d83a7cf1234f5211e3983c5a09853839e',
  1460: '4030077ea993049825434b93c1d4f2e180ba75b067e75e5a958b84620703eb04',
  1471: 'dbc678f21b70d7fee5474638a2700740e586b8e1f8b8239e1928d5a2b07be804',
};
