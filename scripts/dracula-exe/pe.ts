/**
 * Just enough of the PE (Windows executable) format to read statically
 * initialised data out of the original game's `DRACULA.EXE`: the image base
 * and the section table, so a virtual address (VA) found in the code can be
 * turned into a file offset.
 *
 * Going through the section table rather than hard-coding file offsets keeps
 * the readers working on another build of the executable, e.g. another
 * language edition, as long as the VAs themselves still match.
 */

/** Thrown for a buffer that isn't a PE image this reader understands. */
export class PeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PeError';
  }
}

/** One entry of the section table. */
export interface PeSection {
  /** Section name, e.g. `.data`, without its NUL padding. */
  readonly name: string;
  /** Section start, relative to the image base. */
  readonly virtualAddress: number;
  readonly virtualSize: number;
  /** Where the section's bytes start in the file. */
  readonly pointerToRawData: number;
  /** How many bytes of the section are stored in the file. */
  readonly sizeOfRawData: number;
}

/** A parsed PE image. */
export interface PeImage {
  readonly bytes: Uint8Array;
  /** Preferred load address; a section's VA is `imageBase + virtualAddress`. */
  readonly imageBase: number;
  readonly sections: readonly PeSection[];
}

/** Offset of the `e_lfanew` field (where the PE header starts) in the DOS header. */
const E_LFANEW_OFFSET = 0x3c;
/** `PE\0\0`. */
const PE_SIGNATURE = 0x00004550;
/** Size of the COFF file header that follows the signature. */
const FILE_HEADER_BYTES = 20;
/** Offset of `ImageBase` in a PE32 optional header. */
const IMAGE_BASE_OFFSET = 28;
/** Magic of a PE32 (32-bit) optional header. */
const PE32_MAGIC = 0x10b;
/** Size of one section table entry. */
const SECTION_HEADER_BYTES = 40;

/**
 * Parses the headers of a 32-bit PE image.
 *
 * @throws {PeError} if the buffer isn't a PE32 image.
 */
export function parsePe(bytes: Uint8Array): PeImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number): number => view.getUint16(offset, true);
  const u32 = (offset: number): number => view.getUint32(offset, true);

  if (bytes.length < E_LFANEW_OFFSET + 4 || u16(0) !== 0x5a4d) {
    throw new PeError('Not a PE image: missing the "MZ" DOS header');
  }
  const peOffset = u32(E_LFANEW_OFFSET);
  if (peOffset + 4 + FILE_HEADER_BYTES > bytes.length || u32(peOffset) !== PE_SIGNATURE) {
    throw new PeError('Not a PE image: missing the "PE" signature');
  }

  const fileHeader = peOffset + 4;
  const sectionCount = u16(fileHeader + 2);
  const optionalHeaderSize = u16(fileHeader + 16);
  const optionalHeader = fileHeader + FILE_HEADER_BYTES;
  if (u16(optionalHeader) !== PE32_MAGIC) {
    throw new PeError('Only 32-bit (PE32) images are supported');
  }

  const sectionTable = optionalHeader + optionalHeaderSize;
  if (sectionTable + sectionCount * SECTION_HEADER_BYTES > bytes.length) {
    throw new PeError('Section table runs past the end of the file');
  }
  const sections: PeSection[] = [];
  for (let i = 0; i < sectionCount; i++) {
    const header = sectionTable + i * SECTION_HEADER_BYTES;
    const nameBytes = bytes.subarray(header, header + 8);
    const nameEnd = nameBytes.indexOf(0);
    sections.push({
      name: String.fromCharCode(
        ...nameBytes.subarray(0, nameEnd === -1 ? 8 : nameEnd)
      ),
      virtualSize: u32(header + 8),
      virtualAddress: u32(header + 12),
      sizeOfRawData: u32(header + 16),
      pointerToRawData: u32(header + 20),
    });
  }

  return { bytes, imageBase: u32(optionalHeader + IMAGE_BASE_OFFSET), sections };
}

/**
 * The file offset of `length` bytes starting at virtual address `va`.
 *
 * @throws {PeError} if the range isn't stored in the file within one section
 * (e.g. it lies in zero-filled memory past the section's raw data).
 */
export function vaToFileOffset(image: PeImage, va: number, length = 1): number {
  const rva = va - image.imageBase;
  for (const section of image.sections) {
    const start = section.virtualAddress;
    if (rva >= start && rva + length <= start + section.sizeOfRawData) {
      return section.pointerToRawData + (rva - start);
    }
  }
  throw new PeError(
    `VA 0x${va.toString(16)} (+${length} bytes) is not stored in any section of the file`
  );
}

/** The `length` bytes at virtual address `va`. */
export function readVa(image: PeImage, va: number, length: number): Uint8Array {
  const offset = vaToFileOffset(image, va, length);
  return image.bytes.subarray(offset, offset + length);
}
