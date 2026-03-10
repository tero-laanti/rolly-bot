export type DomainEvent<TName extends string, TPayload> = {
  name: TName;
  occurredAt: string;
  payload: TPayload;
};
