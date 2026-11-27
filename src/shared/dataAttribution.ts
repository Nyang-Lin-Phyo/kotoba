/**
 * Attribution shown in the in-app Sources screen.
 *
 * EDRDG requires acknowledgement in-app (not only on a launch page). The same
 * text is shipped as a plain file in `resources/notices/` by the installer.
 */

export const DATA_ATTRIBUTION =
  'Japanese word and kanji data from JMdict and KANJIDIC2, compiled by the Electronic Dictionary ' +
  'Research and Development Group (EDRDG), used under Creative Commons Attribution-ShareAlike ' +
  'Licence 4.0. JSON conversion by scriptin/jmdict-simplified. Kotoba claims no copyright over ' +
  'the source data; the derived dictionary database is distributed under CC BY-SA 4.0.';

export const DATA_SOURCE_URLS = [
  'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
  'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project',
  'https://www.edrdg.org/edrdg/licence.html',
  'https://github.com/scriptin/jmdict-simplified',
] as const;

export const DATA_LICENCE_SUMMARY =
  'CC BY-SA 4.0: you may share and adapt the data, including commercially, provided you give ' +
  'attribution and distribute adaptations under the same licence. See the bundled ' +
  'resources/notices/CC-BY-SA-4.0.txt for the full licence text.';
