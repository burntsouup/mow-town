import { config } from '../config.js';
import { fileName } from './postcard.js';
import { download } from './PhotoMode.js';

/** Video formats to try, best first: MP4 plays almost everywhere; WebM is the fallback. */
const FORMATS = [
  { type: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
  { type: 'video/mp4', extension: 'mp4' },
  { type: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { type: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { type: 'video/webm', extension: 'webm' },
];

/**
 * Records the game's view (and sound) to a video file, for the timelapse clip. Each frame
 * the game has drawn is copied onto a smaller canvas (with the look and a little "mow-town"
 * label), and the browser's MediaRecorder turns that canvas and the game's sound into a
 * video, which is saved to your downloads at the end.
 */
export class ClipRecorder {
  /** @param {HTMLCanvasElement} source The game's canvas. */
  constructor(source) {
    this.source = source;
    this.canvas = document.createElement('canvas');
    this.context = /** @type {CanvasRenderingContext2D} */ (this.canvas.getContext('2d'));
    /** @type {MediaRecorder | null} */
    this.recorder = null;
    /** @type {Blob[]} */
    this.chunks = [];
    this.format = FORMATS.find(
      ({ type }) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
    );
    this.filter = 'none';
    this.badge = ''; // e.g. "▶▶ 21×", in the corner while the replay plays
  }

  /** Whether this browser can record video at all. */
  get isSupported() {
    return Boolean(this.format) && typeof this.canvas.captureStream === 'function';
  }

  get isRecording() {
    return this.recorder !== null;
  }

  /**
   * @param {MediaStream | null} sound The game's sound, if there's any yet.
   * @param {string} filter A CSS filter for the look (see looks.js).
   */
  start(sound, filter) {
    if (!this.isSupported || this.recorder || !this.format) return false;
    const width = config.photo.clipWidth;
    this.canvas.width = width;
    this.canvas.height = Math.round((width * this.source.height) / this.source.width / 2) * 2;
    this.filter = filter;
    const stream = this.canvas.captureStream(30);
    for (const track of sound?.getAudioTracks() ?? []) stream.addTrack(track);
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, {
      mimeType: this.format.type,
      videoBitsPerSecond: 5_000_000, // about 10 MB for a whole timelapse
    });
    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    this.recorder.start(1000);
    return true;
  }

  /** Copies the frame the game just drew. Call right after rendering. */
  captureFrame() {
    if (!this.recorder) return;
    const { context, canvas } = this;
    context.filter = this.filter;
    context.drawImage(this.source, 0, 0, canvas.width, canvas.height);
    context.filter = 'none';
    const size = Math.round(canvas.height * 0.045);
    context.font = `900 ${size}px ui-rounded, 'SF Pro Rounded', Nunito, system-ui, sans-serif`;
    context.textBaseline = 'bottom';
    context.shadowColor = 'rgb(0 0 0 / 0.35)';
    context.shadowBlur = size * 0.3;
    context.fillStyle = '#fffaf0';
    context.fillText('mow-town', size * 0.8, canvas.height - size * 0.6);
    if (this.badge) {
      context.textAlign = 'right';
      context.fillText(this.badge, canvas.width - size * 0.8, canvas.height - size * 0.6);
      context.textAlign = 'left';
    }
    context.shadowColor = 'transparent';
  }

  /** Stops, and saves the video to your downloads. */
  async finish() {
    const { recorder, format } = this;
    if (!recorder || !format) return;
    this.recorder = null;
    const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve));
    recorder.stop();
    await stopped;
    const blob = new Blob(this.chunks, { type: format.type.split(';')[0] });
    this.chunks = [];
    download(blob, fileName('timelapse', new Date(), format.extension));
  }
}
