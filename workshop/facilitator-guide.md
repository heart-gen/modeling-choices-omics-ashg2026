# Facilitator Guide

## Two-Hour Flow

| Segment | Time | Activity |
| --- | ---: | --- |
| Opening and live poll | 15 min | Welcome participants and assess current analytic practices. The poll surface depends on the build — see below. |
| Framing and prediction practice | 15 min | The organiser deck (genomics today, race vs ancestry, meta-analysis masking, local ancestry and Tractor, multi-ancestry PRS), then the "How the modules work" slide. The opening poll has no reveal, so this slide is where commit-then-reveal is practised. |
| Interactive exercises I | 30 min | Scenarios 1–3: pooled/stratified, meta-analysis, and local ancestry (10 min each). |
| Interactive exercises II | 30 min | Scenarios 4–6: complexity, regularization, and scalable inference (10 min each). |
| Synthesis | 15 min | Compare recurring patterns and participant predictions. |
| Wrap-up and Q&A | 15 min | Build a take-home decision framework and answer questions. |

## From the slides to the modules

The organiser deck is the framing segment and nothing else, so each module has to be
introduced from the slide that set it up. The wording in the right-hand column is what
bridges them; the module's own facilitator note repeats the key sentence.

| Deck slide | Module | What to say |
| --- | --- | --- |
| "Genomics today" (Sirugo 2019: ~95% of GWAS studies European-descent) | 1 · Pooled vs Stratified | The top of the ancestry-mix slider *is* this slide. Set 95% and the pooled estimate equals the strong European effect, highly significant, while the African-ancestry estimate has never been distinguishable from zero and nothing in the pooled output says so. The direction is the real LCT biology: rs4988235 is the European persistence allele. |
| Sirugo quote: diverse populations studied "only as part of large meta-analyses" | 1 and 2 | Module 1 is the pooled half of that sentence, module 2 the meta-analysis half. Both show the summary staying narrow and significant while the group-specific biology disappears from view. In module 2, switch the synthesis select: within-ancestry reports four p-values, each meta-analysis one, and the forest rows print the weight each group carries. |
| PCSK9 Y142X / C679X (28% lower LDL, 88% lower CHD) | 1 | Expect "why not PCSK9?" A loss-of-function allele absent in European ancestry cannot be diluted by pooling, because the European sample carries no information about it. Module 1 shows the common-variant case, which is the one that goes unnoticed. |
| Race vs ancestry; race / ethnicity / ancestry definitions | all | Every group in the platform is named as a genetic ancestry ("Admixed American ancestry", not "Latino"). If someone asks, that is deliberate and this slide is the reason. |
| Global ancestry (PCA) vs local ancestry (RFMix mosaics) | 3 · Global vs Local Ancestry | The "Global ancestry PCs" model is the PCA panel; the two local-ancestry models are the RFMix panel, reduced to one locus. The two individuals with the same global ancestry and different local ancestry are the module's premise. |
| Tractor: ancestry segments analysed separately, then meta-analysed | 3, then back to 2 | The "Local ancestry interaction" model is Tractor at a single locus: one effect per ancestry background, then combined — module 1's stratified analysis and module 2's meta-analysis done at one locus. The take-home, said out loud: local ancestry improves power only when the effect differs between backgrounds; when it is similar, global ancestry is the better analysis even if the allele frequencies differ; there is no one right way. The "Same effect, different frequency" preset is that caveat in one click, and the "Best here" line on the detection panel changes hands as the sliders move. |
| Multi-ancestry PRS (Smith 2024; GPS_Mult) | 5 · Polygenic Scores | The module is framed as PRS throughout: a pooled-cohort PRS, an ancestry-aware PRS, and the pooled PRS under strong shrinkage. The smallest group here is the African-ancestry exception on the Smith slide: the pooled score wins on the headline metric and fails the group that was a few percent of the training data. |
| *(no slide)* | 4 · Local Ancestry and Model Complexity | Introduce from module 3: "same three models, same admixed cohort, but a locus where the backgrounds agree and the frequencies are similar. Watch local ancestry fail, not because it is wrong but because complexity was added that the locus did not need." Then the two covariate switches: clinical covariates (BMI, smoking, statins) make every model *more* significant because they explain LDL; sixty batch/site/plate indicators make every model less significant, most at n=250. A term earns its place by what it explains. |
| *(no slide)* | 6 · Scalable Inference | Introduce from module 3: the Tractor-style scan that found the locus is the one that does not finish in a week on a Bridges-2 node. Switch the platform to the laptop most of the room owns: the runtime panel keeps the node's bars hollow beside it and says how many times longer everything takes. Then the GPU node: faster *and* cheaper in service units. Bridges-2 is free with an ACCESS allocation; the cloud panel is the same run on a credit card, so "who can afford it" is mostly "who has an allocation and the expertise to use it". The prices are estimates; the "Where the prices come from" card under the charts says exactly what was quoted and when. |

## Modules that open with a committed prediction

**All six modules** now run as commit → explore → debrief. Participants see the question and
four options; the controls and charts stay locked until they lock in an answer. The platform
computes the answer from each module's own numbers, so it cannot drift from what the charts
show.

| Module | The question they commit to | The answer |
| --- | --- | --- |
| 1 · Pooled vs Stratified | Raise the European-ancestry share from 35% to 95%. What happens to the pooled estimate? | It grows toward the strong European-ancestry effect |
| 2 · Within vs Meta | Four groups are meta-analysed; at 100% heterogeneity the East Asian effect is about 3 times the others'. What happens to the fixed-effect summary? | It stays narrow and significant |
| 3 · Global vs Local Ancestry | Opposite effects on African and European haplotypes (+0.12 / −0.08) in a 15,000-person admixed study. Which is the simplest analysis that detects the locus? | Local ancestry interaction |
| 4 · Local Ancestry and Model Complexity | Same effect on every background, similar frequencies, 500 admixed people adjusted for age, sex and ten PCs. Which of global PCs alone, adding a local-ancestry covariate, and the interaction model detect it? | Global PCs and the local-ancestry covariate, but not the interaction model |
| 5 · Polygenic Scores | Three PRS trained on a 59 / 23 / 18% European / African / Admixed American cohort. Which is best calibrated in the smallest group? | The ancestry-aware PRS |
| 6 · Scalable Inference | Standard GWAS scan (1×), local ancestry-aware scan (4×), permutation scan (4,000×) on a Bridges-2 RM node (128 cores). Which finish within a week? | The standard GWAS scan and the local ancestry-aware scan, but not the permutation scan |

The exact wording is generated into the bundles and the "Commit first" slides; the table
above is a summary. The wrong answers are worth as much as the right ones. Module 2's "it
stops being significant" and module 4's "all three" are the ones people pick, and both are
instructive when the room sees how many agreed with them.

The flow below is written for module 3, and every module runs the same way.

1. **Collect (2 min).** Read the question aloud: *which is the simplest analysis that detects
   this locus?* Say explicitly that nobody can see the charts yet.
2. **Project the split (2 min).** The run sheet's "Room vs reality" panel charts the room's
   answers live and marks the derived one. Narrate the split before revealing — the second
   option ("adding local ancestry as a covariate") is the intuitive wrong answer, and how
   much of the room picks it is the teaching moment.
3. **Explore (5 min).** Send them to the presets. "Same effect, different frequency" is the
   one that surprises people who have just learned to reach for the interaction model: with
   the same effect on both backgrounds the plain scan wins, even though the allele frequency
   differs three-fold, because the interaction model pays for its extra parameters in
   degrees of freedom. "Too small to tell" separates *no effect* from *underpowered*.
4. **Debrief (1 min).** Ask what would have to be true of a real cohort for the opposite-effects
   setting to be the right model of it.

Reset the module's counts between sessions along with the opening poll:
`POLL_ID=predict-global-vs-local-ancestry npm run polling:reset`, or omit `POLL_ID` for all.

Without the polling backend the commit still works and still reveals; only the room's split
is missing, so take a show of hands before revealing.

## Facilitation Notes

- Ask participants to predict how the result will change before moving a control.
- Use the “What changed?” panel to keep the focus on interpretation.
- Use the “Why this matters” panel to connect analytic choices to equity-relevant inference.
- Keep backup screenshots available in case the room network is unstable.

### The opening poll

Which surface you get is decided at build time, and the run sheet shows whichever applies:

- **Primary (AWS) deployment.** Participants answer on the platform's own poll page,
  `<site>/#/poll` (linked from the landing page and the top nav; the join slide carries the
  URL), and the facilitator run sheet charts live aggregate counts. It is not a module:
  there is no derived answer and nothing to reveal. Nothing else to set up.
- **Backup (GitHub Pages) deployment.** The run sheet shows a join link for an external
  poll tool instead of counts. **Open that tool's presenter view in a second window before
  the session** — the platform cannot show the responses, and switching windows cold in
  front of the room is the failure mode worth avoiding.
- **Neither configured.** The panel says so, and the opening segment runs as a show of
  hands. Every scenario module works unchanged in all three cases.
