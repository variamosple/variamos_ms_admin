// As Sequelize takes them; the driver refuses a value it cannot send
type Replacements = Record<string, unknown>;

export abstract class BaseRepository {
  initializeReplacements(filter: object | undefined | null) {
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
