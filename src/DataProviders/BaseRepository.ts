export interface Replacements {
  [key: string]: string | number | boolean | null | Date | string[] | number[];
}

export abstract class BaseRepository {
  initializeReplacements(filter: Replacements) {
    if (!filter) {
      return {};
    }

    return Object.entries(filter).reduce<Replacements>(
      (result, [key, value]) => {
        result[key] = value === undefined ? null : value;

        return result;
      },
      {},
    );
  }
}
