# Accuracy, sources, and limits

Last verified: **2026-10-14**. All costs are in **USD**.

## Three different measurements

1. **API-equivalent cost** is what observed token usage would cost at the bundled API rate list. It does not measure a subscription bill, purchased credits, taxes, or discounted contracts.
2. **Plan usage** is the percentage a provider recorded for an account's allowance. It is not computed by dividing token cost by a subscription price.
3. **Time** includes active logged turns and a separate session span. Active time sums turn intervals; the span includes gaps. Simultaneous sessions contribute independently to the total active work figure. Old unfinished turns stop accruing time after three minutes without a relevant log event and are marked idle.

## Claude Code tokens

The parser extracts `message.usage` from assistant JSONL records: input, cache reads, cache creation, output, and reasoning. One-hour cache writes are distinguished when `cache_creation.ephemeral_1h_input_tokens` is present. Cache reads/writes are additional to Claude's uncached `input_tokens`. Reasoning is already part of output and is not billed again.

Message/request IDs deduplicate streamed chunks and copied transcripts. The largest counters observed for a response are retained. Logs are never rewritten. Unsupported metadata remains ignored. Only usage metadata survives parsing; prompts and output are not cached or sent to the renderer.

Claude rates follow [Anthropic's official pricing table](https://platform.claude.com/docs/en/about-claude/pricing). The table includes standard input, output, cache read, five-minute cache write, and one-hour cache write rates. Recorded fast mode on supported Opus variants applies the documented premium. Recorded US inference adds 10%. Recorded web searches add the published $0.01 per search. Other tool charges, unrecorded premiums, and negotiated rates may not be represented.

## Codex tokens

Newer rollouts provide `token_usage_record.payload.usage`, keyed by response ID. The fallback for older versions uses changed cumulative totals and `last_token_usage` when available. Repeated totals do not add spend. Once response records appear, cumulative events do not also add spend. If old totals decrease after compaction, the new baseline is accepted; tokens are never subtracted from previously recorded work.

Codex `input_tokens` includes cached and cache-written input. TokenCal subtracts those categories before pricing normal input. Reasoning output is contained in output; it is never counted twice. Forked or copied logs with the same response ID are deduplicated globally. Legacy logs without response IDs offer weaker deduplication, based on session ID, timestamp, and cumulative total; a reused total after compaction remains a distinct response.

Official price sources:

- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5)

Bundled rates are standard API prices. Where supplied in the log, fast/priority, batch, flex, and ultrafast tiers modify the cost. Supported GPT models use the documented long-context threshold of 272,000 prompt tokens, with 2x input/cache and 1.5x output rates. Older models without documented cache-write rates use the input rate for cache writes unless a specific rate is bundled or overridden. GPT-5.5 is assigned a 1.25x write rate consistent with the newer family; this is an assumption for any log that records writes on that legacy model.

Pricing is applied at response level with the current bundled list, including historical responses. It does not reconstruct past prices or retrospectively raise all earlier responses when a legacy model's session-wide long-context threshold is crossed. Consequently, historical API value is an estimate.

## Model price gaps

Model names are normalized only for dated snapshots and Claude version punctuation. New minor versions do not inherit the nearest family price. Unknown models, including internal auto-review models without a public rate, keep their token counts but have no invented cost. Cost cards show `≥` and the unpriced token amount. Settings permits local rate overrides; zero rates are valid for free/local models.

Prices ship with releases and never refresh over the network automatically. Verify an override against the provider's official rate before saving it. Source rate changes may make the bundled estimate out of date.

## Codex limits and resets

`event_msg` → `token_count` → `rate_limits` provides the source percentages, window durations, plan, and reset timestamps. Windows are classified by their actual duration, rather than assuming `primary` is always five hours. Each limit bucket is kept separately. Percentages older than 20 minutes are marked stale. An expired reset never becomes a made-up 0%; the UI asks for a fresh observation.

Limits are account-level readings from this computer, not per-session allowances. Switching accounts may change the latest reading. A new Codex request is needed if the local logs have no current limits. TokenCal never uses banked resets or reads `auth.json`.

## Claude limits and resets

### Local tracking by default

Both providers' token counts, estimated costs, and session time come from local JSONL logs without login setup. Codex logs also contain recorded account quotas. The Claude Code transcripts inspected for this implementation contain response usage, but not equivalent five-hour/weekly plan quotas. Claude desktop history supplies those percentages. A stale desktop history does not prevent new session tokens, costs, or time from updating.

### Optional account readings

The account mode is off by default and requires an explicit choice and confirmation in Settings. Only then does it use Claude Code's existing subscription login for a read-only request to Anthropic's usage endpoint every three minutes. This is an optional authenticated API path, separate from normal no-login tracking. macOS may require the normal Keychain permission. Windows/custom profiles use the agent's existing credential file. See [privacy](privacy.md) for the exact credential and network boundary.

The provider's `five_hour`, `seven_day`, `seven_day_opus`, and `seven_day_sonnet` windows supply utilization and reset timestamps. Available windows are independent; a missing session window does not discard a valid weekly window or become zero. Reset timestamps are provider observations and are not marked `~`. Unsupported/missing values stay unavailable. This internal endpoint is also used by [CodexBar's Claude provider](https://github.com/steipete/CodexBar/blob/main/docs/claude.md); its schema and availability can change.

A successful request dates the reading. Polling, failed requests, and retry backoff never refresh that timestamp. Failed refreshes retain the previous reading visibly stale. Unauthorized logins and changed tokens clear the old in-memory reading before a new account can supply data. TokenCal does not refresh or modify shared credentials; Claude Code owns that login. API-key-only or insufficient-scope logins may not expose subscription usage. These percentages cover the signed-in Claude Code account, which can differ from Claude desktop.

### Saved desktop fallback

Claude desktop history supports version 1 (percentages next to `t`) and version 2 (`samples[].u`). It provides `fh` (five-hour), `sd` (weekly), and optional `so`/`sn` model-specific weekly windows. The newest account's samples are kept separate from other accounts during reset inference. The plan history belongs to the desktop account; it may differ from the Claude Code account.

The percentages are provider-recorded. The history contains **no official reset timestamp**. TokenCal uses the most recent percentage drop as an estimated renewal anchor, and a first positive sample after zero as a five-hour anchor when available. The later sample in that bracket is conservative; missed readings can make estimates substantially late. Each inferred reset is explicitly marked `~`. Without an anchor, the UI says the reset is unavailable. It never rolls an old reading forward to pretend that it is current.

Readings older than 20 minutes are visibly stale; expired windows are shown as awaiting fresh data. Keeping Claude's main window open or refreshing its Settings Usage page does not guarantee history updates. The installed 2.37337.1 Mac app's sampler can pause after 24 hours without its tray usage action; an ordinary left-click does not trigger that action, and the icon may be hidden or unavailable. The default app retains the saved observation time and labels the source as desktop history; it cannot force Claude to save a new reading. Optional account mode can read allowances independently if explicitly enabled. Cost and session tracking work independently.

## Coverage

Only local Claude Code and Codex logs are supported. No browser ChatGPT history, cloud sessions, Cursor, Copilot, OpenCode, or API billing account is collected. Retention is configurable from 7 to 365 days, with a 90-day default. Sessions shown/exported are capped at the 2,000 most recently active; aggregate totals include all records in the retained range.

Malformed records, symlinks, lines above 32 MiB, subfolders deeper than ten levels, and files beyond the 20,000-file cap are skipped. Visible diagnostics report unreadable sources and skipped records. Unfinished JSONL lines are deferred until a newline arrives. Consequently, usage can lag by one refresh interval plus any provider logging delay.
