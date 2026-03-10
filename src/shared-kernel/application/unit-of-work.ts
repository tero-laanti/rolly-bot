export type UnitOfWork = {
  runInTransaction: <T>(work: () => T) => T;
};
