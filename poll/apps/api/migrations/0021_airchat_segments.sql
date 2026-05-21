-- airchat: cache Whisper segments alongside voice records.
--
-- Whisper's verbose_json response includes a `segments` array of
-- { start, end, text } in seconds. We store them as integer
-- milliseconds (DAG-CBOR can't represent floats) on the PDS record,
-- and as a JSON-encoded TEXT column here so feed responses can deliver
-- caption-timing data without fanning out to N PDSes.
--
-- Used for: in-feed live captions during audio playback, and
-- caption-synced video export via ffmpeg.wasm.

ALTER TABLE airchat_voices ADD COLUMN segments_json TEXT;
