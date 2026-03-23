import type { IntroPostMessageData } from "../../../rolly-data/types";

export type ManagedIntroPostRecord = {
  slotIndex: number;
  channelId: string;
  messageId: string;
  createdAt: string;
  updatedAt: string;
};

export type SaveManagedIntroPostInput = {
  slotIndex: number;
  channelId: string;
  messageId: string;
};

export type ManagedIntroPostsRepository = {
  listManagedIntroPosts: () => ManagedIntroPostRecord[];
  saveManagedIntroPost: (input: SaveManagedIntroPostInput) => void;
  deleteManagedIntroPost: (slotIndex: number) => void;
};

export type IntroPostsPublisher = {
  assertSendableChannel: (channelId: string) => Promise<void>;
  hasMessage: (input: { channelId: string; messageId: string }) => Promise<boolean>;
  createMessage: (input: { channelId: string; content: string }) => Promise<{ messageId: string }>;
  editMessage: (input: { channelId: string; messageId: string; content: string }) => Promise<void>;
  deleteMessage: (input: { channelId: string; messageId: string }) => Promise<void>;
};

export type IntroPostsContentSource = {
  getMessages: () => IntroPostMessageData[];
};
