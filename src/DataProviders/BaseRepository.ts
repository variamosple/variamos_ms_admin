/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/explicit-member-accessibility */
export interface Replacements {
  [key: string]: any;
}

export abstract class BaseRepository {
  initializeReplacements(filter: Replacements) {
    if (!filter) {
      return {};
    }

    return Object.entries(filter).reduce<Replacements>((result, [key, value]) => {
      result[key] = value === undefined ? null : value;

      return result;
    }, {});
  }
}
