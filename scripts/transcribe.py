"""
Word-level speech-to-text for Clipper AI, using faster-whisper.

Invoked by src/infra/ai/asr.ts. Emits a single JSON object on stdout so the
Node side never has to parse human-readable output.

Accuracy notes:
  * `language` is forced when the user picked one. Whisper's own detection
    looks at the first 30 seconds only, which regularly mislabels Indonesian
    as Malay/Tagalog and code-switched speech as English. Forcing it is the
    single biggest accuracy win for non-English audio.
  * `condition_on_previous_text=False` stops the decoder from repeating or
    inventing text after a bad segment, which is the usual cause of captions
    that drift away from what was actually said.
  * VAD trims silence so the model does not hallucinate words into dead air.
"""

import argparse
import json
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--model", default="small")
    ap.add_argument("--language", default="")          # "" or "auto" -> detect
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--compute-type", default="int8")
    ap.add_argument("--beam-size", type=int, default=5)
    args = ap.parse_args()

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # pragma: no cover - environment problem
        print(json.dumps({"error": f"faster-whisper not importable: {exc}"}))
        return 2

    language = args.language.strip().lower()
    if language in ("", "auto"):
        language = None

    try:
        model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    except Exception as exc:
        print(json.dumps({"error": f"could not load model '{args.model}': {exc}"}))
        return 3

    try:
        segments, info = model.transcribe(
            args.audio,
            language=language,
            task="transcribe",           # never "translate" — must stay verbatim
            word_timestamps=True,
            beam_size=args.beam_size,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 400},
            condition_on_previous_text=False,
        )

        words = []
        for seg in segments:                       # generator: this is the work
            for w in seg.words or []:
                text = w.word.strip()
                if not text:
                    continue
                words.append(
                    {
                        "w": text,
                        "s": round(float(w.start), 3),
                        "e": round(float(max(w.end, w.start + 0.02)), 3),
                        "c": round(float(w.probability), 3),
                    }
                )
                # Progress on stderr so the pipeline log can show movement.
                if len(words) % 200 == 0:
                    print(f"transcribed {len(words)} words ({words[-1]['s']:.0f}s)", file=sys.stderr, flush=True)
    except Exception as exc:
        print(json.dumps({"error": f"transcription failed: {exc}"}))
        return 4

    print(
        json.dumps(
            {
                "language": info.language,
                "languageProbability": round(float(info.language_probability), 3),
                "duration": round(float(info.duration), 2),
                "model": args.model,
                "forced": language is not None,
                "words": words,
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
