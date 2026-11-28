import { describe, expect, it } from 'vitest';
import { parseSubtitle, SubtitleError } from '../../src/shared/subtitle';

describe('subtitle parsing', () => {
  it('parses valid SRT cues and strips markup', () => {
    const text = '1\n00:00:01,000 --> 00:00:03,000\n<i>こんにちは</i>\n\n2\n00:00:04,000 --> 00:00:05,000\n猫が すきです\n';
    const cues = parseSubtitle(text, 'clip.srt');
    expect(cues).toHaveLength(2);
    expect(cues[0]?.text).toBe('こんにちは');
    expect(cues[1]?.startMs).toBe(4000);
  });

  it('parses ASS dialogue with commas in the text', () => {
    const text = '[Script Info]\nTitle: test\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,こんにちは、猫です\n';
    const cues = parseSubtitle(text, 'clip.ass');
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe('こんにちは、猫です');
  });

  it('treats plain text as one block and rejects oversized or unsupported input', () => {
    expect(parseSubtitle('猫が すきです', 'notes.txt')).toHaveLength(1);
    expect(() => parseSubtitle('x'.repeat(300_000), 'big.txt')).toThrow(SubtitleError);
    expect(() => parseSubtitle('x', 'clip.vtt')).toThrow(SubtitleError);
  });
});
