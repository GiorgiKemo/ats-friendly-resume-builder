// Font subsetting with HarfBuzz's subsetter (harfbuzz-subset.wasm from the
// harfbuzzjs package): the same engine Google Fonts and Chrome use. The wasm
// module has no imports, so any runtime can instantiate it from its bytes.

const HB_MEMORY_MODE_WRITABLE = 2;
const HB_SUBSET_FLAGS_NO_HINTING = 0x1;
const HB_SUBSET_FLAGS_RETAIN_GIDS = 0x2;
const HB_SUBSET_FLAGS_NOTDEF_OUTLINE = 0x40;
const HB_SUBSET_SETS_DROP_TABLE_TAG = 3;

// Tables a shaped, embedded PDF font never needs: shaping already happened.
const DROPPED_TABLES = ['GSUB', 'GPOS', 'GDEF', 'BASE', 'JSTF', 'MATH', 'kern', 'morx', 'mort', 'feat', 'DSIG', 'cmap', 'vhea', 'vmtx', 'VORG'];
const tagValue = (tag) => [...tag].reduce((value, char) => (value << 8) | char.charCodeAt(0), 0) >>> 0;

/**
 * Instantiates the subsetter from wasm bytes (Uint8Array/ArrayBuffer), a
 * compiled WebAssembly.Module, or an already-instantiated exports object.
 * Returns `subset(fontBytes, glyphIds) => Uint8Array` that keeps original
 * glyph ids (unused glyphs become empty), so a CID map can point straight at
 * the source font's glyph ids.
 */
export const createHbSubsetter = async (source) => {
  let exports = source?.hb_subset_or_fail ? source : null;
  if (!exports) {
    const instance = source instanceof WebAssembly.Module
      ? await WebAssembly.instantiate(source, {})
      : (await WebAssembly.instantiate(source, {})).instance;
    exports = instance.exports;
  }
  const {
    memory, malloc, free,
    hb_blob_create, hb_blob_destroy, hb_blob_get_data, hb_blob_get_length,
    hb_face_create, hb_face_destroy, hb_face_reference_blob,
    hb_set_add, hb_subset_input_create_or_fail, hb_subset_input_destroy,
    hb_subset_input_glyph_set, hb_subset_input_set, hb_subset_input_set_flags, hb_subset_or_fail,
  } = exports;

  return (fontBytes, glyphIds) => {
    const fontPtr = malloc(fontBytes.length);
    new Uint8Array(memory.buffer).set(fontBytes, fontPtr);
    const blob = hb_blob_create(fontPtr, fontBytes.length, HB_MEMORY_MODE_WRITABLE, 0, 0);
    const face = hb_face_create(blob, 0);
    hb_blob_destroy(blob);
    const input = hb_subset_input_create_or_fail();
    try {
      if (!input) throw new Error('HarfBuzz could not start a font subset.');
      const glyphs = hb_subset_input_glyph_set(input);
      hb_set_add(glyphs, 0);
      for (const gid of glyphIds) hb_set_add(glyphs, gid);
      const dropped = hb_subset_input_set(input, HB_SUBSET_SETS_DROP_TABLE_TAG);
      for (const tag of DROPPED_TABLES) hb_set_add(dropped, tagValue(tag));
      hb_subset_input_set_flags(input, HB_SUBSET_FLAGS_RETAIN_GIDS | HB_SUBSET_FLAGS_NO_HINTING | HB_SUBSET_FLAGS_NOTDEF_OUTLINE);
      const subsetFace = hb_subset_or_fail(face, input);
      if (!subsetFace) throw new Error('HarfBuzz could not subset a PDF font.');
      const resultBlob = hb_face_reference_blob(subsetFace);
      const dataPtr = hb_blob_get_data(resultBlob, 0);
      const length = hb_blob_get_length(resultBlob);
      const bytes = new Uint8Array(memory.buffer, dataPtr, length).slice();
      hb_blob_destroy(resultBlob);
      hb_face_destroy(subsetFace);
      if (!bytes.length) throw new Error('HarfBuzz returned an empty PDF font.');
      return bytes;
    } finally {
      if (input) hb_subset_input_destroy(input);
      hb_face_destroy(face);
      free(fontPtr);
    }
  };
};
