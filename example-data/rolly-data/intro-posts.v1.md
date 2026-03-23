# `intro-posts.v1.json`

This file defines the bot-managed intro posts that are synchronized to `INTRO_POST_CHANNEL_ID` when the bot starts.

Minimal shape:

```json
{
  "messages": [
    {
      "content": "# Welcome to Rolly\nUse `/roll` to get started."
    }
  ]
}
```

Rules:

- `messages` must contain at least one entry.
- Each entry must include a non-empty `content` string.
- v1 supports plain Discord message text/markdown only. Do not add embeds or buttons here.
- The bot tracks and edits its own intro messages automatically, so authors do not need to manage Discord message IDs manually.

Authoring notes:

- Keep each message within Discord's message-length limit.
- Order matters. The bot keeps one managed Discord message per array slot.
- If you shorten the array, the bot deletes its extra tracked intro posts on the next startup sync.
