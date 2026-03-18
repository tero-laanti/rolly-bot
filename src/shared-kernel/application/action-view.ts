export type ButtonStyleSpec = "primary" | "secondary" | "success" | "danger";

export const maxActionButtonsPerRow = 5;

export type ActionButtonSpec<TAction> = {
  action: TAction;
  label: string;
  style: ButtonStyleSpec;
  disabled?: boolean;
};

export type ActionButtonRowSpec<TAction> = ActionButtonSpec<TAction>[];

export type ActionView<TAction> = {
  content: string;
  components: ActionButtonRowSpec<TAction>[];
};

export const chunkActionButtons = <TAction>(
  buttons: ActionButtonSpec<TAction>[],
  buttonsPerRow = maxActionButtonsPerRow,
): ActionButtonRowSpec<TAction>[] => {
  const rows: ActionButtonRowSpec<TAction>[] = [];

  for (let index = 0; index < buttons.length; index += buttonsPerRow) {
    rows.push(buttons.slice(index, index + buttonsPerRow));
  }

  return rows;
};

export type ActionResult<TAction> =
  | {
      kind: "reply";
      payload:
        | {
            type: "view";
            view: ActionView<TAction>;
            ephemeral?: boolean;
          }
        | {
            type: "message";
            content: string;
            ephemeral: boolean;
          };
    }
  | {
      kind: "update" | "edit";
      payload:
        | {
            type: "view";
            view: ActionView<TAction>;
          }
        | {
            type: "message";
            content: string;
            clearComponents?: boolean;
          };
    };
