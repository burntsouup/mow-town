// @ts-check

/**
 * The postcard you can save from photo mode: the picture with a cream border, and a caption
 * strip underneath with a stamp. Pure: just the layout and the words (PhotoMode.js draws it).
 *
 * @typedef {{ x: number, y: number, width: number, height: number }} Box
 * @typedef {{ width: number, height: number, border: number, radius: number, photo: Box,
 *   caption: Box, stamp: Box, titleSize: number, lineSize: number }} PostcardLayout All in
 *   pixels: the card's size, the photo's frame and corner rounding, where the caption and
 *   the stamp go, and the two lines' font sizes.
 */

/**
 * Lays a postcard out round a photo of the given size (the photo isn't scaled).
 *
 * @param {{ width: number, height: number }} photo
 * @returns {PostcardLayout}
 */
export function postcardLayout(photo) {
  const border = Math.round(Math.min(photo.width, photo.height) * 0.05);
  const captionHeight = Math.round(photo.height * 0.17);
  const width = photo.width + border * 2;
  const height = photo.height + border * 2 + captionHeight;
  const caption = {
    x: border,
    y: border * 1.5 + photo.height,
    width: photo.width,
    height: captionHeight - border * 0.5,
  };
  const stampSize = Math.round(caption.height * 0.92);
  return {
    width,
    height,
    border,
    radius: Math.round(border * 0.3),
    photo: { x: border, y: border, width: photo.width, height: photo.height },
    caption,
    stamp: {
      x: caption.x + caption.width - stampSize * 0.82,
      y: caption.y + (caption.height - stampSize) / 2,
      width: stampSize * 0.82,
      height: stampSize,
    },
    titleSize: Math.round(caption.height * 0.36),
    lineSize: Math.round(caption.height * 0.21),
  };
}

/**
 * What the postcard says: a greeting, and where and how well the lawn was mowed.
 *
 * @param {{ place: string | null, pattern: string, score: number | null, progress: number }}
 *   info place: the lawn's name (null if you're not near one); pattern: the pattern's name
 *   ("Stripes"); score: how well it matched, 0..1, once the job's done (else null);
 *   progress: how much of it is mowed, 0..1.
 */
export function postcardCaption({ place, pattern, score, progress }) {
  const title = 'Greetings from mow-town!';
  if (!place) return { title, line: 'A sunny day on the street' };
  if (score !== null) return { title, line: `${place} · ${pattern} ${Math.floor(score * 100)}%` };
  if (progress <= 0) return { title, line: `${place}, waiting for a mow` };
  return { title, line: `${place} · ${Math.floor(progress * 100)}% mowed` };
}

/**
 * A file name for something saved from the game, e.g. "mow-town-postcard-2026-09-30.jpg".
 *
 * @param {string} kind
 * @param {Date} date
 * @param {string} extension
 */
export function fileName(kind, date, extension) {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
  return `mow-town-${kind}-${day}.${extension}`;
}
