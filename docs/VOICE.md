# NOVA voice — how it works and what it would cost

NOVA is Sentinel's co-presenter voice. It speaks short, name-aware lines when something happens in the
incident ("Victor has authorized the security side") and a few scene cues in Presenter Mode. Every line is
also shown as a caption, so nothing depends on sound.

## What runs today (free, no keys)

NOVA uses the browser's built-in **Web Speech API** (`speechSynthesis`). The voices are installed on the
device. No text leaves the computer, nothing is billed and no API key exists anywhere in the code.

| Feature | Where | Notes |
| --- | --- | --- |
| Voice choice | Settings → NOVA voice lab | Natural (neural) voices are ranked first, then enhanced or premium ones, then the accent you chose (English (India) by default). English text is never read by a non-English voice. Novelty voices are hidden. A badge shows the quality of the voice in use (natural, enhanced or standard), with advice when a better one is available. |
| Accent preference | Settings | English (India) by default. Hindi and Marathi voices can be chosen if installed. |
| Pronunciations | Settings → Pronunciations | Editable respellings applied to every voice (NOVATECH → "Nova-tech"). Team names get built-in respellings only on non-Indian voices, because Indian voices already say them well. |
| Rate, pitch, volume, mute | Settings and the header voice button | Saved per browser. |
| Story or executive style | Settings | Story lines name the person ("Sarah has priced the exposure"); executive lines are shorter. |
| Automatic / on cue / off | Presenter console | Automatic speaks scene cues and incident events; on cue waits for "Speak cue"; off stays silent. |
| Captions and transcript | Caption bar, Settings → Transcript | Word-by-word highlight while speaking; the last lines can be replayed. |
| Interruptions | Console "Silence", key **M**, scene changes | A new scene stops the previous line. |
| Fallback | Automatic | If the browser has no voice, blocks speech or never starts it, captions run on a timer instead. |
| Reliability | Automatic | See “Why NOVA no longer goes quiet” below. |

### Getting a smooth voice

- **Present from Microsoft Edge** (Windows or Mac). Edge's free “Natural” voices are neural voices and sound
  human: "Microsoft Neerja Online (Natural) – English (India)" and "Prabhat" for Indian English, plus Aria,
  Jenny, Sonia and others. They stream from Microsoft while Edge is online; NOVA picks them automatically.
- **Chrome on Mac:** macOS voices — System Settings → Accessibility → Spoken Content → System voice → Manage voices → English (India): Rishi, Veena (Lekha is the Hindi voice) — plus Chrome's own "Google UK English" and "Google हिन्दी" voices.
- **Safari on iPhone:** the first line must come from a tap (the "Present with NOVA" or voice buttons do this). Download an English (India) voice under Settings → Accessibility → Spoken Content → Voices.

### Why NOVA no longer goes quiet

Browsers drop long utterances, refuse speech before the first click in a window, and sometimes never fire the
start event. NOVA now:

1. speaks one sentence at a time, with a short pause between sentences, so a dropped sentence never silences a
   whole line;
2. watches every sentence: if it has not started within a few seconds it is retried once; if it stalls, NOVA
   moves on and the caption keeps going;
3. when the browser refuses speech (no click yet in that window), shows the caption, marks the window as
   needing a click and replays the line after that click (one **Start the projector** click in the projector
   window covers full screen, sound and voice);
4. waits briefly after cancelling a previous line, and for the voice list to load, before speaking;
5. stops using a voice that fails and falls back to the next one.

A pre-recorded or downloadable neural voice (for example the open-source Kokoro model) was considered for
identical sound on every computer. Installing external model code was not permitted in the build session, so
none is bundled; Edge's Natural voices are the free route to the same quality.

## Optional paid cloud voice (not built — a module we could add)

A cloud voice gives every device the same studio-quality voice. It needs a small server-side function,
because **an API key must never ship in the browser bundle**. The design:

1. A Vercel Function `/api/nova-tts` holds the provider key in a Vercel environment variable (never a `VITE_` variable).
2. The browser sends the line's text; the function returns MP3 audio. Requests are limited to NOVA's own lines (allow-list by hash) so the endpoint can't be used as a free TTS service by others.
3. Audio is cached by a hash of text + voice, so a line is only paid for once.
4. If the function fails or is slow, NOVA falls back to the on-device voice and captions — the demo never stops.

### Expected volume

| Use | Characters spoken |
| --- | --- |
| One incident run (alert + seven gates, story style) | about 1,400 (measured: ransomware 1,376; executive style 931) |
| One 8-minute Presenter Mode show (scene cues + incident lines) | about 1,600 |
| Same show with "Read the script" used for every scene | about 5,000 |
| 50 full rehearsals | about 80,000–250,000 |

### Cost at current list prices (checked 28 October 2026)

| Provider and voice | Free each month | After the free tier |
| --- | --- | --- |
| Google Cloud, Standard / WaveNet | 4 million characters | US$4 per million |
| Google Cloud, Neural2 | 1 million characters | US$16 per million (≈ US$0.08 for a 5,000-character show) |
| Google Cloud, Chirp 3: HD | 1 million characters | US$30 per million (≈ US$0.15 per show) |
| Microsoft Azure, neural voices (F0 tier) | 0.5 million characters | see the Azure pricing calculator |

For a class project, the volume above stays inside every free tier, so the realistic cost is **zero**, plus
the time to add the function (about two hours) and to create a cloud account with billing enabled. Google
and Azure both require a payment method even for free-tier use.

Sources: [Google Cloud Text-to-Speech pricing](https://cloud.google.com/text-to-speech/pricing),
[Azure Speech pricing](https://azure.microsoft.com/en-gb/pricing/details/cognitive-services/speech-services/).

## Sound cues

All sounds are synthesized live with the Web Audio API (no recordings, no copyrighted effects). Each cue has
a caption ("Rising approval cadence", "Closing chord") so it is never the only signal. The cues: new critical
alert, acknowledged, approval requested / granted / returned, action started, verified, closed, remote request,
consent pending, cancelled, the 30-second scene warning and scene changes. A critical alert adds a two-tone
klaxon (three cycles) under the ATTENTION overlay, and the final step ends with a power-down sweep. Volume and
mute are in the header. If the audio engine was suspended by the browser, it is resumed before each cue.
