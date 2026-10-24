export const storageMigrations = [
  "001-initial.sql",
  "002-repository.sql",
  "003-lifecycle.sql",
  "004-repository-observation.sql",
  "005-event-schema-version.sql",
] as const;
export const STORAGE_VERSION = storageMigrations.length;
