# Workshop Deck

One deck for the session, on ASHG's 2026 speaker template. It opens with the title slide
(both organisers) and the two disclosure slides, and closes with a thank-you slide. Between
them are the platform slides (join, agenda, how the modules work, then a commit slide, an
answer slide and one slide per reveal chart for each module, then synthesis), the organiser's
literature examples after the module each one belongs to, and two module 6 resource slides on
CPU, multi-thread and GPU tooling. No
projected question, option, answer or chart is typed by hand: the platform slides come
from the scenario bundles and from chart panels captured off the running app.

```bash
npm run export:slides -- --url https://workshop.example.org  # or WORKSHOP_URL=...; required
npm run export:slides -- --url https://workshop.example.org --short-url https://tinyurl.com/x
                                                             # or WORKSHOP_SHORT_URL=...
npm run build:deck                                           # re-lay out only; no browser
```

`export:slides` validates the bundles, captures the charts into `captures/`, writes the slide
content to `platform-slides.json`, and runs `build:deck`. That step (`build_deck.py`, run with
`uv` and python-pptx) writes `ASHG2026-modeling-choices.pptx`. Everything here is gitignored.
The deck as presented at the workshop is published in [`slides/`](../../slides/) at the
repository root.

The export fails if a chart named in the capture config no longer matches exactly one chart
card, if the facilitator guide's two-hour table disagrees with the bundles on module minutes,
or if two slides would share a title.

The join slide prints the workshop address and a QR code for it. The QR code always encodes
the workshop URL itself. `--short-url` changes only the address printed for people to type:
give it a short link that redirects to the workshop URL. The opening poll is reached from
the site's top menu, so its long `#/poll` address is in the speaker notes and not on the slide.

## Inputs that are not in the repository

- **The ASHG template**, `2026-PowerPoint-Template_Speakers.pptx` in this directory, from
  <https://www.ashg.org/wp-content/uploads/2026/07/2026-PowerPoint-Template_Speakers.pptx>.
  The build keeps its title slide and its two disclosure slides and drops the samples. Its
  10–20 MB photographs are downscaled to 2560 px, which leaves the deck at about 9 MB.
- **The organiser's deck**, `ASHG_KJ_2026_platform-slides.pptx` by default (`--examples PATH`
  or `--examples none`). Every slide in it that the build did not generate is carried over
  after the module it followed. That works on the hand-merged deck and on the built deck
  itself: edit `ASHG2026-modeling-choices.pptx`, point `--examples` at it, and rebuild after a
  bundle change. A filled-in disclosure or title slide in it is kept over the template's.

- **Logos**, in `logos/` (`--logos DIR`), used only on the closing slide, because ASHG's logo
  policy allows institutional logos only on an acknowledgement slide, preferably the last.
  `heart-gen.png` is `heart_gen/presentations/figures/lab-logo-v2.png`, `feinberg.png` is
  `heart_gen/lab_management/lab_protocols/logos/Feinberg-linear-RGB.png`, and `nimhd.png`
  is `heart_gen/presentations/figures/nimhd-logo.png`. A missing logo is left off, with a
  warning.

The organisers, their titles, the affiliation and the R00 funding line are `ORGANIZERS`,
`AFFILIATION` and `FUNDING` in `build_deck.py`. They appear on the title slide and on the
closing "Thank you" slide.

## Chart slides

Each reveal's charts are captured at the state its question describes, not at the state the
module opens in. Module 1 is shown at 35% and 95% European ancestry, module 2 at 0% and
100% heterogeneity, module 5 at the starting and the strongest shrinkage, and module 6 on an
RM node and a GPU node. The app's `?compare` view draws every strategy on the panels the
model select normally filters, because a projected slide has no select to move.
Participants never see that view. The captures and their states are the `captures` table in
`apps/web/scripts/export-slides.mjs`.

## ASHG presenter guidelines

<https://ashgmeeting.ashg.org/programs/presenter-guidelines/>. The build enforces what it can:

- 16:9 on ASHG's template, with the meeting's title slide, palette, Poppins and footer.
- 44 pt titles in the template's title placeholder, and a unique title on every generated
  slide.
- Nothing generated is under 24 pt. A reveal's explanation, the agenda's activity column, the
  how-it-works detail, the opening poll's options and the synthesis questions are in the speaker
  notes rather than on the slide.
- One chart per slide, and the slide title says which state it shows.

What the build leaves to people:

- **Disclosure.** Slides 2 and 3 carry ASHG's own wording, in the plural: neither presenter
  has a relationship to report, and nothing unlabeled or investigational is discussed
  (confirmed 2026-10-18). `DISCLOSURES` in `build_deck.py` holds the text. Both slides are
  shown and read aloud first.
- **Long questions.** Modules 4 and 6 ask questions of about 300 characters. They are on the
  slide at 24 pt, but over six lines, because the poll counts these exact options. Shorten
  them in the generator if that matters.
- **Chart lettering.** Axis labels are the app's 12 px type and project at about 11 pt. Talk
  through the axes, as the guidelines ask.
- **The example slides** keep their content. A slide with a title has the title moved into the
  template's title position and the rest fitted below it. A slide without one is fitted above
  the footer bars. Text keeps the size its own layout gave it, so several slides are still
  under 24 pt, and five have no title. Those are the organiser's to fix.
