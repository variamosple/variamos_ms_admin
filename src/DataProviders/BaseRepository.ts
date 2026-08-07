export interface Replacements {
  [key: string]:
    | string
    | number
    | boolean
    | null
    | undefined
    | Date
    | string[]
    | number[];
}

export abstract class BaseRepository {
  initializeReplacements(filter: object | undefined | null) {
    if (!filter) {
      return {};
    }

    return Object.entries(filter).reduce<Replacements>(
      (result, [key, value]) => {
        result[key] =
          value === undefined ? null : (value as Replacements[string]);

        return result;
      },
      {},
    );
  }
}
