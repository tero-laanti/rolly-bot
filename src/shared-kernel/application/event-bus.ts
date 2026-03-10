import type { DomainEvent } from "../domain/domain-event";

export type DomainEventHandler = (event: DomainEvent<string, unknown>) => Promise<void> | void;

export type EventBus = {
  publish: (event: DomainEvent<string, unknown>) => Promise<void>;
  subscribe: (handler: DomainEventHandler) => void;
};

export const createInMemoryEventBus = (): EventBus => {
  const handlers: DomainEventHandler[] = [];

  return {
    publish: async (event) => {
      for (const handler of handlers) {
        await handler(event);
      }
    },
    subscribe: (handler) => {
      handlers.push(handler);
    },
  };
};
