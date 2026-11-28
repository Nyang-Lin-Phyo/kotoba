/** Bounded, offline subtitle and plain-text parsing. No remote fetching, no markup execution. */

export type SubtitleCue = {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
};

const MAX_CHARS = 200_000;
const MAX_LINES = 2_000;
const MAX_CUES = 1_000;

export class SubtitleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubtitleError';
  }
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').replace(/\\N/g, ' ').trim();
}

function clockMs(value: string): number {
  const match = /^(\d{1,3}):([0-5]\d):([0-5]\d)[,.](\d{1,3})$/.exec(value.trim());
  if (match === null) return -1;
  const [, hours, minutes, seconds, fraction] = match;
  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1000 +
    Number((fraction ?? '').padEnd(3, '0'))
  );
}

function parseSrt(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;
    const [startText, endText] = lines[timingIndex]?.split('-->') ?? [];
    if (startText === undefined || endText === undefined) continue;
    const startMs = clockMs(startText);
    const endMs = clockMs(endText);
    if (startMs < 0 || endMs <= startMs) continue;
    const body = lines.slice(timingIndex + 1).map(stripMarkup).filter((line) => line.length > 0);
    if (body.length === 0) continue;
    cues.push({ startMs, endMs, text: body.join(' ') });
    if (cues.length >= MAX_CUES) break;
  }
  return cues;
}

function parseAss(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('Dialogue:')) continue;
    const fields = line.slice('Dialogue:'.length).split(',');
    if (fields.length < 10) continue;
    const startMs = clockMs(fields[1] ?? '');
    const endMs = clockMs(fields[2] ?? '');
    const body = stripMarkup(fields.slice(9).join(','));
    if (startMs < 0 || endMs <= startMs || body.length === 0) continue;
    cues.push({ startMs, endMs, text: body });
    if (cues.length >= MAX_CUES) break;
  }
  return cues;
}

/** Dispatches by extension. Plain text becomes a single cue with no timing. */
export function parseSubtitle(text: string, filename: string): SubtitleCue[] {
  if (text.length === 0 || text.length > MAX_CHARS) {
    throw new SubtitleError('The file is empty or larger than 200,000 characters.');
  }
  if (text.split(/\r?\n/).length > MAX_LINES) {
    throw new SubtitleError('The file has more than 2,000 lines.');
  }
  const extension = filename.toLowerCase().split('.').at(-1) ?? '';
  if (extension === 'srt') return parseSrt(text);
  if (extension === 'ass') return parseAss(text);
  if (extension === 'txt') {
    const body = stripMarkup(text);
    return body.length === 0 ? [] : [{ startMs: 0, endMs: 0, text: body }];
  }
  throw new SubtitleError('Only .srt, .ass and .txt files are supported.');
}
