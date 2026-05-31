# Task: Streaming narration via /dev/captioned_speech stream=true

## Branch
`main` (feature branch `feature/streaming-narration` if preferred)

## Key discovery
`/dev/captioned_speech` in kokoro-fastapi ALREADY supports streaming with word
timings when `stream: true` is set in the request body. It returns newline-
delimited JSON where each line is a `CaptionedSpeechResponse`:

```json
{"audio": "<base64_chunk>", "audio_format": "audio/mpeg", "timestamps": [{"word": "Hello", "start_time": 0.0, "end_time": 0.3}]}
{"audio": "<base64_chunk>", "audio_format": "audio/mpeg", "timestamps": [{"word": "world", "start_time": 0.3, "end_time": 0.6}]}
```

The edelmore-diary currently calls this with `stream: false`, which waits for
the ENTIRE entry to be synthesized (30-50s for a full page) before returning.
With `stream: true`, the first chunk arrives in ~2s and audio starts immediately.

## Goal
Update `/api/speak` server endpoint and the client-side narration system to
consume the streaming response: start playing the first audio chunk as soon as
it arrives, apply word timings per chunk, and chain chunks seamlessly with
continuous page-turn scheduling.

## Files to change

### `src/routes/api/speak/+server.ts`
This is the server-side proxy that forwards requests to Kokoro's
`/dev/captioned_speech`. Currently it awaits the full JSON response, then
returns `{ audio, format, words }` to the browser.

Change it to:
1. Set `stream: true` in the upstream request body
2. Read the upstream `JSONStreamingResponse` line-by-line (NDJSON)
3. Return a `ReadableStream` to the browser with the same NDJSON format,
   forwarding each chunk as it arrives

The client already has `voiceURI`, `text`, `speed` — the upstream body shape
doesn't change except for `stream: true`.

The response back to the browser should be a streaming `Response` with
`Content-Type: application/x-ndjson` and `Transfer-Encoding: chunked`.

```typescript
// Rough shape of the upstream chunk (from CaptionedSpeechResponse):
interface KokoroChunk {
  audio: string;          // base64 audio
  audio_format: string;   // mime type
  timestamps: UpstreamWord[];
}
```

Forward each parsed chunk as a JSON line to the browser.

### `src/routes/(authenticated)/+layout.svelte` — `speakFromOffsetViaTts()`
Currently awaits the full `/api/speak` response as JSON, then plays all audio
at once. Change to:

1. Open a `fetch` to `/api/speak` (streaming response)
2. Read the body as a `ReadableStream` via `response.body.getReader()`
3. Decode NDJSON lines as they arrive
4. On the FIRST chunk:
   - Decode base64 audio → Blob URL
   - Create `HTMLAudioElement` and start playing immediately
   - Set `birdTtsTimings` from this chunk's timestamps (adjust by `birdTtsBaseOffset`)
   - Start boundary polling
5. On SUBSEQUENT chunks:
   - Append audio to a queue (see note below)
   - Extend `birdTtsTimings` with new timestamps (offset-adjusted)
6. On stream end: finalize

**Audio queueing note:** The browser can't append to a playing `HTMLAudioElement`
natively. Two options:
- **Simple**: Use the Web Audio API `AudioContext` + `AudioBufferSourceNode` to
  queue decoded chunks — supports gapless playback
- **Pragmatic**: Create a new `Audio` element per chunk, start each when the
  previous ends. Slight gap between chunks but much simpler to implement.

Start with the pragmatic approach. The gap will be small (~100ms) and the UX
is already vastly better than a 30s wait.

**Word timing continuity across chunks:** Each chunk's `timestamps` are relative
to that chunk's text. The `birdTtsBaseOffset` is the absolute position in
`content` where the current chunk starts. When you receive the next chunk,
advance `birdTtsBaseOffset` by the length of the previous chunk's text before
applying its timestamps.

**Page turn scheduling:** `computeFlipScheduleTime()` looks at
`birdTtsTimings` for words past the spread boundary. With progressive timings,
you'll have earlier chunks' timings immediately and later chunks' timings as
they arrive. The scheduling logic works correctly as long as `birdTtsTimings`
is extended (not replaced) with each chunk.

**AbortController:** The existing `birdTtsFetchAbort` controller already aborts
the fetch. With streaming, aborting the fetch closes the reader. Add a
`reader.cancel()` call in `cleanupTtsAudio()`.

## Acceptance criteria
- Bird button starts playing audio within ~2s of being pressed (even on a
  full diary entry of multiple paragraphs)
- Word highlighting works continuously throughout playback (not just per chunk)
- Page turns fire at the correct word boundary, not at chunk boundaries
- Pressing bird while loading cancels immediately (existing AbortController)
- Pressing bird while playing pauses/resumes (existing behavior)
- Rate changes mid-playback restart from correct position (existing behavior)
- Fallback to Web Speech still works when TTS is unavailable

## Verification
Manual test in dev server (`npm run dev`) with a diary entry spanning 2+ pages:
1. Press bird — audio should start within ~2s
2. Watch word highlighting track speech throughout
3. Confirm page turn fires at the correct spread boundary
4. Press bird mid-playback — should pause
5. Press again — should resume
6. Press bird while loading — should cancel cleanly

## Commit format
```
narration: stream captioned_speech chunks for near-instant playback

Switch /api/speak from buffered to streaming mode (stream=true on the upstream
Kokoro request). Audio starts within ~2s regardless of entry length. Word
timings arrive per-chunk and are applied progressively, preserving highlighting
and page-turn scheduling throughout playback.
```
