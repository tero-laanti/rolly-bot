export type RaidButtonAction =
  | {
      kind: "panel-open-boss-chooser";
      tierId: string;
    }
  | {
      kind: "choose-boss";
      tierId: string;
      bossId: string;
    }
  | {
      kind: "join-run";
      runId: string;
      version: number;
    }
  | {
      kind: "leave-run";
      runId: string;
      version: number;
    }
  | {
      kind: "start-run";
      runId: string;
      version: number;
    }
  | {
      kind: "cancel-run";
      runId: string;
      version: number;
    };
