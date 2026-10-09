# EquiGen vs Dexter — Competitive Gap Analysis

**Purpose:** Identify every place EquiGen lags the mature reference implementation
(`virattt/dexter`, ~27K stars) toward becoming reliable for real institutional users, with
(1) how Dexter implements it, (2) EquiGen's current state, (3) a concrete remediation plan.

**Scope of analysis:** full read of both codebases.
Dexter: `D:\13.current-startups\3.Dexter\dexter` (`dexter-ts` v1.0.4, Bun, ~210 src files).
EquiGen: `D:\13.my-startups\EquiGen` (Next.js 15, React 19, Prisma 7/Postgres, LangGraph).

**Market difference (by design, not a gap):** Dexter = US/global, single-user local CLI +
WhatsApp. EquiGen = India-only, multi-tenant institutional web platform with SEBI RA-2014
compliance. All platform-surface gaps below (WhatsApp, cron, TUI) are **not** recommended —
they are listed only for completeness.

---

## 1. Executive Verdict

**EquiGen is materially better than Dexter at financial correctness, and materially worse
at proving it.**

| Dimension | Dexter | EquiGen | Winner |
|---|---|---|---|
| Deterministic financial math in TS | **None** (all LLM arithmetic) | 3-statement engine, DCF, Monte Carlo, bands | 🟢 **EquiGen** |
| Financial statement integrity checks | **None** (no cross-foot) | Cross-foot by construction + 8-rule math auditor w/ retry loop | 🟢 **EquiGen** |
| Anti-fabrication runtime engine | **None** | 13-check `FinancialEvaluationEngine`, degraded-quality gates | 🟢 **EquiGen** |
| Forensic accounting | **None** | Altman Z, Beneish M, CFO/PAT, governance | 🟢 **EquiGen** |
| Indian units / fiscal years | **None** | crore/lakh parser, FY Apr–Mar | 🟢 **EquiGen** |
| Multi-tenancy + compliance lifecycle | **None** (local, single-user) | org isolation, state machine, AuditLog, SEBI sign-off | 🟢 **EquiGen** |
| **Eval / benchmark harness** | 50-Q rubric CSV, LLM-judge, contradiction scoring, dataset hashing, LangSmith | 3 golden JSONs, 4/6 fields unused, fire-and-forget, one script broken | 🔴 **Dexter** |
| **Test depth & rigor** | 23 files / ~210 cases, byte-exact & adversarial | 21 files / 87 cases, thresholds 60/60/50, forensic engine untested | 🔴 **Dexter** |
| **Error taxonomy & honesty** | classifyError, fail-fast classes, user-facing formatting, `_errors` surfaced to model | 14 silent `catch {}`, crashed audit ≡ "not run" | 🔴 **Dexter** |
| **Context & memory management** | 3-tier compaction ladder, memory flush, hybrid RAG w/ MMR + decay | 113-line compactor, in-memory non-persisted memory | 🔴 **Dexter** |
| **Agent iteration / reflection** | tool-usage advisory, Jaccard loop detection, self-critique checklists | fixed sequential milestone loop, no reflection | 🔴 **Dexter** |
| **Subagent isolation** | allowlisted toolsets, 1-level depth, read-only | hardcoded singletons, no spawn | 🔴 **Dexter** |
| **Cache discipline** | volatility-aware TTLs, corruption self-heal, closed-window-only | fixed `revalidate`, freshness falsified | 🔴 **Dexter** |
| **Skills / methodology system** | `SKILL.md` registry w/ progressive disclosure | all prompts inline | 🔴 **Dexter** |
| **Permission engine** | allow/ask/deny grammar, security floor, read-only classifier | single Python blocklist | 🔴 **Dexter** |
| **Per-datum provenance** | Partial (tool-level `sourceUrls`) | **Neither has it** | ⚪ Both |
| **Claim→source citations in output** | **Neither renders them** | ⚪ Both | ⚪ Both |

**Star count measures polish, breadth and community, not financial rigor.** Dexter's 27K stars
come from a beautiful CLI, 9 LLM providers, WhatsApp, cron, memory RAG, and a real eval
harness. Its *financial* correctness layer is weaker than EquiGen's — it computes no valuation
math in code at all. EquiGen's risk is the inverse: strong internal machinery that is
**unverified, unwired, and partly theatrical.**

> **Single highest-leverage change:** make the verification you already built actually
> binding, then measure it. Today `FinancialEvaluationEngine` returns
> `FAILED_UNRELIABLE` and nothing reads it; `ConsistencyCheckerTool` runs and its result is
> discarded; `pipelineEval` is fire-and-forget. Fixing enforcement (P0-1, P0-2) plus adopting
> Dexter's rubric eval (P0-3) closes more real risk than any new feature.

---

## 2. Where EquiGen Is Already Ahead — Do Not Regress

Documented so these are not "fixed" into parity with Dexter.

1. **Real valuation engine.** `src/lib/financial-modeling/three-statement-engine.ts` computes
   working capital from DSO/DIO/DPO, capex schedule, debt amortisation, FCFF, Gordon-growth
   terminal value, discount factors — with `balanceSheetDiff` exposed as an interface
   invariant. Dexter's entire DCF is prose in `src/skills/dcf/SKILL.md` executed by the LLM's
   arithmetic.
2. **Self-correcting extraction loop.** `src/lib/ai/langgraph-pipeline.ts:962-986` builds a
   real `StateGraph` with `audit_financials` → conditional edge → `extract_financials`
   (max 2 retries), injecting the errors back into the prompt (`:715-717`). Dexter has **no**
   reflect/replan loop.
3. **Cross-foot enforcement.** Balance-sheet identity holds by construction
   (`three-statement-engine.ts:247-249`); the math auditor independently rejects EBITDA>Revenue,
   PAT>Revenue, PAT margin>60% with an explicit *"Check for Lakhs vs Crores unit mismatch"* hint
   (`:853-855`), TP/CMP scale ratio >25×, rating-vs-upside contradiction, shareholding sum
   outside 98–102%.
4. **Anti-fabrication engine + blocking gates.** `src/lib/eval/financial-eval-engine.ts`
   (13 checks, 3 verdicts) and — uniquely — two real gates: `src/lib/queue/worker.ts:68-98`
   blocks report creation on failed financial chunks; `src/lib/report/state-machine.ts:28-53`
   refuses `approved`/`published` without explicit `qualityAck` on degraded data.
5. **Magic-constant fallback fingerprint.** `financial-eval-engine.ts:227-247` detects
   `baseRevenue === 10000 && sharesCr === 50 && margin ≈ 0.18` as synthetic. No Dexter analogue.
6. **Forensic accounting in code.** `src/lib/ai/tools/forensic-accounting-tool.ts` computes
   Altman Z, Beneish M, CFO/PAT, working-capital stress, governance penalties → health score.
   Dexter has nothing equivalent.
7. **Indian domain correctness.** `parseIndianNumber` (`src/lib/parsers/table-extractor.ts:73-100`)
   handles crore/lakh/mn/thousand, parenthesised negatives, ₹/$, lakh grouping — and is
   **unit-tested** (8 cases). FY logic Apr–Mar is correct in 3 independent places.
8. **Compliance & tenancy lifecycle.** `AuditLog`, `ReportHistory` state machine with
   `contentHash`, reviewer assignment, SEBI attestation sheet gating the Excel export.

---

## 3. Gap Analysis

Severity: 🔴 blocks real-user trust · 🟠 significant reliability/quality gap · 🟡 polish/maturity.

---

### GAP-01 🔴 Evaluation Harness — the single biggest gap

**Dexter implementation**

`src/evals/` (5 modules) + `src/evals/dataset/finance_agent.csv` (51 KB, 238 lines).

- **50 hand-authored questions**, each with a **JSON rubric of atomic, independently
  checkable criteria**, split into two operators:
  - `correctness` — 194 criteria across 9 question types (Market Analysis 3, Trends 3,
    Beat-or-Miss 7, Complex Retrieval 3, Qualitative Retrieval 9, Quantitative Retrieval 9,
    **Numerical Reasoning 8**, **Financial Modeling 4**, Adjustments 4).
  - `contradiction` — 50 criteria. 16/50 questions target numeric/modeling correctness.
- **Rubric parsed and validated before a run can start** (`src/evals/dataset.ts:102-152`):
  hard-fails on invalid JSON, non-array, non-object entry, unknown operator, empty criteria,
  and **zero correctness criteria** (`missing correctness criteria`). Expert-time (human
  baseline minutes) validated at `:168-171`. Tested at `dataset.test.ts:34-38`.
- **Scoring** (`src/evals/evaluator.ts:108-112`):
  ```ts
  const score = contradictionDetected ? 0 : passedCriteria / Math.max(correctnessCriteria.length, 1);
  ```
  Partial credit; **any single contradiction hard-zeros the score** — the anti-"technically
  true but misleading" mechanism. Missing judge output = **fail, not skip**
  (`passed: judgment?.passed ?? false`).
- **Self-judge guard** (`options.ts:97-99`): target model ≠ judge model unless
  `--allow-self-judge`. Tested `options.test.ts:91-110`.
- **Reproducibility:** SHA-256 dataset hash (`dataset.ts:183-194`) embedded in the run name
  (`run.ts:326-336`) so a dataset change *is* a new regression baseline; seeded deterministic
  FNV-1a → LCG → Fisher-Yates sampling stratified by question type (`sampling.ts:3-30`),
  tested for determinism.
- **Failure classification, never silently scored** (`run.ts:32,74-90`): `agent_error`,
  `timeout`, `judge_error`; agent failures detected from answer prefix; failures get
  `score: null`, are **excluded from the average but counted in failures** — a crashing model
  cannot inflate its score.
- Telemetry recorded per example: latency, iterations, tool-call count, both model IDs,
  `reference_outputs`, full per-criterion judgments.

**EquiGen current state**

- `src/lib/eval/golden-examples/{RELIANCE,TCS,HDFCBANK}_golden.json` — **range bands only**
  (`valueMinCr`/`valueMaxCr`). Only `revenue` and `marketCap` are actually consumed;
  `ebitdaMargin`, `trailingPE`, `beta`, `currentPrice` (4 of 6) are **declared but never read**.
- Bands are so wide they cannot detect real error (RELIANCE revenue 850k–980k Cr ≈ ±7% of a
  value that has moved >3× since authoring) and **stale** (RELIANCE `currentPrice` band
  2200–3200 vs ~1,300–1,500 real).
- **No LLM-as-judge rubric scoring.** `SebiComplianceTool.auditReportAsync` is a pass/fail
  compliance gate, not a graded quality eval, and its output is **unvalidated `JSON.parse`**
  (`sebi-compliance-tool.ts:99`).
- **`pipelineEval.run()` is fire-and-forget and its output is discarded**
  (`master-orchestrator.ts:632-634`: `.catch(err => console.warn(...))`). Never persisted,
  never returned, never gates.
- `scripts/run-eval.ts` **cannot run** — line 49 references `agentTaskSuccess` /
  `taskSuccessRatePercent` / `successfulTurns`, but `eval-service.ts` exposes
  `agentToolRouting.{accuracyPercent,totalTestCases,successfulRoutings}`.
- `scripts/evaluate-agent-quality.ts` (the only harness with `throw` on failure) is **not in
  `package.json` scripts** and never runs in CI (no CI config exists at all).
- `GoldenExample` **DB model exists and is never queried**. `example-doc/*.pdf` (3 committed
  reference PDFs) are referenced by **no test** — no golden-PDF regression.
- **No snapshots, no persisted score history, no baseline file, no trend tracking.** Every
  score is ephemeral.
- `/api/eval/run` infers liveness from non-nullness (`rawData?.companyData?.marketCap != null
  → isLiveData: true`, `:68`) and backfills `fetchedAt ?? new Date()` (`:76`) — **so the
  freshness and authenticity checks it reports cannot fail.**

**Remediation plan**

| Step | Action | File |
|---|---|---|
| 1 | Author `src/lib/eval/dataset/equity_agent.csv` — 50+ Indian questions, columns `Question, ReferenceAnswer, QuestionType, ExpertTimeMinutes, Rubric(JSON)`. Target ≥40% numeric/modeling. | new |
| 2 | Port `parseRubric()` fail-closed validation + `loadEvalDataset()` with SHA-256 hash. Reject: bad JSON, non-array, unknown operator, empty criteria, zero correctness criteria. | `src/lib/eval/rubric.ts` |
| 3 | Port scoring: `contradictionDetected ? 0 : passed / max(total,1)`; missing judgment ⇒ **fail**. | `src/lib/eval/rubric.ts` |
| 4 | Port seeded stratified sampling (FNV-1a → LCG → Fisher-Yates) + hash-in-run-name. | `src/lib/eval/sampling.ts` |
| 5 | `ScoringJudge` = LLM-as-judge with zod `outputSchema` + `.parse()` (**not** bare `JSON.parse`), distinct model from target, `--allow-self-judge` guard. | `src/lib/eval/judge.ts` |
| 6 | Add `EvalRun` + `EvalResult` + `EvalCriterion` Prisma models; persist every run, criterion verdict, score, contradiction flag, failure type. | `prisma/schema.prisma` |
| 7 | `GET /api/eval/report` — score trend, per-question-type breakdown, contradiction list, failure breakdown. | new route |
| 8 | Fix `scripts/run-eval.ts` field names; add `pnpm eval` and `pnpm eval:regression` scripts; wire into CI with a **committed baseline JSON** and a fail threshold. | `scripts/`, `package.json`, `.github/workflows/ci.yml` |
| 9 | Replace golden ranges with **tolerance-based** assertions (±2% on revenue/EBITDA at a pinned `asOf` date) and delete the 4 unused fields — or wire them into checks. | `golden-examples/*.json`, `pipeline-eval.ts` |
| 10 | Make `pipelineEval` **blocking on CRITICAL FAIL** and surface its verdict in `FinancialHero`. | `master-orchestrator.ts:632` |
| 11 | Stop falsifying freshness/liveness in eval — remove `?? new Date()` and the non-null inference. | `api/eval/run/route.ts:68,76` |

---

### GAP-02 🔴 Test Suite Depth & Rigor

**Dexter implementation** — 23 files, ~152 `test()` blocks, ~210 executed cases (`test.each`
expansion), Bun runner, CI-gated (`ci.yml:17-20` runs `typecheck` + `test`).

Quality patterns EquiGen has no equivalent of:

- **Byte-exactness round trip** — `read-file.test.ts:43-44`: `expect(reconstructed).toBe(original)`.
- **Encoding-corruption detection** — `read-file.test.ts:65`: `expect(reconstructed).not.toContain('\uFFFD')`.
  *Directly relevant: EquiGen's own `math-sumprecise-polyfill.ts:9-11` documents that ₹/±/×
  glyphs stop mapping in financial PDFs — and EquiGen ships `₹` mojibake in output templates
  (`?1,650` in `api/eval/route.ts:30`; `-?${…}` in `ScenarioModeler.tsx:628,708`).*
- **Cache corruption self-heal** — `cache.test.ts:81-109`: invalid-structure entry returns
  `null` **and** deletes the file.
- **Pagination completeness** — `api.test.ts:48-51`: asserts 4 records merged from 3 pages and
  that page 2+ is requested verbatim.
- **Adversarial corpus** — `engine.test.ts:102-126` runs a 57-command malicious shell corpus;
  `read-only.test.ts` is a 48-case matrix. Permission tests are fail-closed.
- **Bounded-retry proof** — `x-search.test.ts:60-73`: `expect(calls).toBe(4)`.
- Real filesystem, real subprocess, stubbed network — **not** mocks-everything.

**EquiGen current state**

- 21 files / 87 cases. `vitest.config.ts` thresholds **60 lines / 60 funcs / 50 branches**,
  scope `src/lib/**` only. All 33 components (incl. `html-report-generator.ts` at 120 KB,
  `UnifiedReportView.tsx` 30.8 KB, `ScenarioModeler.tsx` 32.4 KB, `ForensicAuditCard.tsx`
  14.7 KB) and 35/37 API routes are effectively untested.
- **Zero tests for:**
  - `forensic-accounting-tool.ts` — Altman Z, Beneish M, CFO/PAT thresholds, health score. The
    one component computing accounting judgement, entirely unverified. (It appears in tests
    only as a hardcoded fixture in `agent-chat-and-modify.test.ts:82-117`.)
  - `eval-service.ts` — the advertised `overallBenchmarkScore` is never asserted.
  - `institutional-equity-data.ts` — the synthetic generator + its `isValidEquityResearchData` gate.
  - `html-report-generator.ts` — the actual published PDF.
  - `sebi-compliance-tool.ts`, `synthesis-agent.ts`, `compliance-agent.ts`, `master-orchestrator.ts`,
    `master-planner.ts`, `parallel-extract.ts`, `worker.ts`, `state-machine.ts`, `retry-wrapper.ts`,
    `rate-limiter.ts`, `loop-safety.ts`, `ticker-resolver.ts`, `api-keys.ts`, `jwt.ts`, `password.ts`,
    `bse-filings-tool.ts`, `nse-filings-tool.ts`, `puppeteer-client.ts`, `nse-session.ts`.
  - The Python sandbox `DANGEROUS_PATTERNS` blocklist (`python-executor.ts:34-39`) — a security
    control with no test.

**Remediation plan**

| Step | Action |
|---|---|
| 1 | Raise thresholds to 75/75/65 and extend coverage scope to `src/lib/**` + `src/app/api/**` + `src/components/**`. |
| 2 | **`forensic-accounting-tool.test.ts`** — table-driven: CFO/PAT boundaries (1.0, 0.65, 0.0, negative PAT); Altman zones (2.99, 1.81); Beneish (< -1.78); pledge >5%/>20%; auditor qualification; health-score clamp. |
| 3 | **`state-machine.test.ts`** — assert `qualityAck` is *required* for degraded → approved/published and that omission throws. This is a compliance control. |
| 4 | **`sandbox-blocklist.test.ts`** — port Dexter's adversarial corpus style: assert every pattern in `DANGEROUS_PATTERNS` is rejected and that rejection persists a `SandboxArtifact` with `exitCode 1`. |
| 5 | **`html-report-generator.test.ts`** — golden-HTML snapshot for the published report; assert the ₹ glyph renders (guards the mojibake), and assert provenance badges are **absent** when data is missing. |
| 6 | **`ticker-resolver.test.ts`** — stub search: `.NS` preferred, `.BO` fallback, legacy suffix stripping, unresolved → `isResolved:false`. |
| 7 | **Encoding guard** — add `expect(out).not.toContain('\uFFFD')` to every PDF/Excel/HTML test; fix the 4 known mojibake sites. |
| 8 | **`bse-financial-data-tool` FY test** — pin a quarterly fixture and assert 4 quarters sum to the FY row and that the EPS aggregation rule is explicit. |
| 9 | Golden-PDF regression over `example-doc/*.pdf` (Dexter-style byte-exactness for rendered output). |
| 10 | Add `.github/workflows/ci.yml`: `typecheck` + `vitest run` + `pnpm eval:regression`. **EquiGen has no CI at all** — Dexter does. |

---

### GAP-03 🔴 Error Taxonomy, Honesty & Partial-Failure Visibility

**Dexter implementation**

- **Error classification** (`src/utils/errors.ts:20-77,207-223`): a substantial pattern library
  (incl. Chinese-language context-overflow strings and `'tpm'` disambiguation so TPM limits
  aren't misread as overflow) →
  `isNonRetryableError()` = `context_overflow | billing | auth`.
- **Retry with fail-fast** (`src/model/llm.ts:30-50`): 3 attempts, `500·2^n` backoff, **immediate
  throw on non-retryable**.
- **Structured parsing + actionable user-facing text** (`errors.ts:83-146,225-264`): strips
  prefix junk, extracts status, parses 3 JSON error shapes, captures `request_id`; unknown errors
  surface as `HTTP {code} ({type}): {message} [request_id: {id}]`. Billing errors get actionable
  remediation text.
- **Partial failure is returned to the model, not dropped** (`get-financials.ts:189-214`):
  ```ts
  if (failedResults.length > 0) {
    combinedData._errors = failedResults.map((r) => ({ tool: r.tool, args: r.args, error: r.error }));
  }
  ```
  The agent *sees* which sub-queries failed. Same in `get-market-data.ts:211-237`,
  `read-filings.ts:296-316`.
- **Failed tool calls are still counted** toward loop limits (`tool-executor.ts:216-221`).
- **Coverage-limitation disclosure** — a rare honesty pattern
  (`formatters.ts:239`): *"No Form 3/5 ownership statements on file… This is normal — many
  insiders report via Form 4 instead. Absence here does not imply missing coverage."*
- Bounded context-overflow recovery with a typed `context_cleared` event; compaction degrades
  in 3 tiers and reports failure as an event, never a crash.

**EquiGen current state**

- `parseRetryAfterSeconds` + 300s ceiling + typed `RateLimitError` → HTTP 429
  (`retry-wrapper.ts`) is **good and comparable**.
- **14 bare `catch {}`** in `src/components/`; and in `src/lib/`, silent data-loss swallows:
  - `valuation-bands-engine.ts:266-268` — network error silently substitutes **fabricated
    sinusoid history**. A Yahoo outage produces invented ±2σ bands with **no warning in UI or PDF**.
  - `bse-financial-data-tool.ts:123-125,147-149,167-169,268-270` — 4× `catch { return null/{}/[] }`;
    a BSE outage is **indistinguishable from "no data"**.
  - `master-orchestrator.ts:496-498` — thrown forensic audit → `forensicAnalysis: null` → UI shows
    *"Forensic Data Ingestion Pending"*, which reads as in-progress, not failed.
  - `master-orchestrator.ts:532-534` — crashed authenticity engine → `financialAudit: null` →
    the `FinancialHero` audit badge **simply doesn't render** (`FinancialHero.tsx:130`). A
    crashed engine is indistinguishable from never-run.
  - `master-orchestrator.ts:606-608` — `ReportHistory.upsert(...).catch(console.warn)` → **the
    whole report can fail to persist and the run still reports success.**
  - `download/route.ts:70-72` — `catch { report = null }` silently falls through to the
    **synthetic-PDF path**.
  - `parallel-extract.ts:419` uses `Promise.all` (not `allSettled`) → one chunk rejection kills
    the batch.
- `Promise.allSettled` **is** used correctly in 5 places (`bse-financial-data-tool.ts:314`,
  `credit-rating-tool.ts:212`, `sector-news-deep-tool.ts:190`, `peer-comparison-tool.ts:166`,
  `budget/limit-discovery.ts:145`) — but **the rejection reasons are discarded**; no `_errors`
  equivalent reaches the model or the report.

**Remediation plan**

1. Port `src/utils/errors.ts` → `src/lib/utils/errors.ts`: `classifyError`, `parseApiErrorInfo`,
   `formatUserFacingError` (status + JSON payload + `request_id` + actionable text).
2. Add `NonRetryableError` class; short-circuit `auth | billing | validation | context_overflow`.
3. **Replace every `catch { return null }` in `src/lib/ai/tools/` with a `DataSourceResult<T>`**
   `{ ok, data, source, fetchedAt, warnings[], error? }`. A failed fetch must be *typed* as a
   failure, never as absence of data.
4. Add `_errors`/`warnings` propagation into the milestone payload and the SSE trajectory so
   both the model and the reviewer see partial failures.
5. **Make `financialAudit: null` and `forensicAnalysis: null` impossible to confuse with success:**
   add `auditStatus: 'ok' | 'failed' | 'not_run'` and render a red "Audit failed" state in
   `FinancialHero` / `ForensicAuditCard`.
6. `ReportHistory.upsert` must be awaited or its failure escalated — a run must not report
   success without a persisted report.
7. `parallel-extract.ts:419` → `allSettled` with per-chunk degraded marking.
8. Delete the silent synthetic-history fallback in `valuation-bands-engine.ts`; throw a typed
   error and render "bands unavailable — insufficient price history".
9. Port the coverage-limitation disclosure pattern: when a source yields nothing, say *why*
   absence is expected (e.g. "no BSE credit-rating announcement in the last 5 years; many
   unrated SMEs have none").
10. Replace 14 `catch {}` with `catch (e) { logger.warn('[component] …', e) }`.

---

### GAP-04 🔴 Context Management & Memory

**Dexter implementation** — `src/agent/{compact,microcompact,tokens,scratchpad}.ts` + `src/memory/` (12 files).

- **3-step ladder** (`agent.ts:556-658`), gated on real API token counts
  (`lastApiInputTokens > 0 ? … : estimateTokens(…)`), threshold = `contextWindow − 20K − 13K`:
  1. **Memory flush** — extract durable facts to daily memory *before* discarding context.
  2. **LLM compaction** on the provider's **fast model**, requiring ≥3 tool results, max 3
     consecutive failures; replaced by `[SystemMessage, HumanMessage(query + summary)]`.
  3. **Truncate** to `KEEP_TOOL_USES = 5`.
- **Numeric-preservation contract** in the compaction prompt (`compact.ts:56`):
  *"6. Numerical Data: ALL key numbers retrieved — prices, revenue figures, margins, ratios,
  growth rates, estimates, dates. This section is critical; do not omit any numbers that were
  returned by tools."* plus `compact.ts:43` *"Double-check for numerical accuracy and
  completeness."*
- **Microcompact** (per-turn, cheap): fires at >8 compactable ToolMessages or >80k est. tokens,
  keeps last 4, replaces old results with `[Old tool result content cleared]`.
- **Large results offloaded before compaction**: >50K chars → disk + a
  `[Result persisted to …]` pointer; per-turn cap 200K chars
  (`tool-result-storage.ts`, `tool-result-budget.ts`).
- **Hybrid RAG** (`src/memory/`, SQLite FTS5 + vectors, `database.ts:38-72`):
  5-stage retrieval (`search.ts`) = candidate gen (×4) → weighted merge **0.7 vector + 0.3
  keyword** → **temporal decay** `exp(-ln2/30 × ageDays)` with MEMORY.md evergreen-exempt →
  **MMR diversity re-rank** λ=0.7 (Jaccard) → top-K. Chunking 400 tok / 80 overlap with
  SHA-256 change detection. Embedding cache keyed on `content_hash`, **wiped on provider
  fingerprint mismatch** (`index.ts:97-101`). `fs.watch` indexer with 1500ms debounce and a
  self-perpetuating-loop guard (`indexer.ts:43-55`).
- **Graceful degradation**: DB failure → `db = null`, `isAvailable() false`, reason surfaced in
  tool output instead of crashing (`memory/index.ts:88-95`).

**EquiGen current state**

- `src/lib/ai/context-compactor.ts` — **113 lines**; triggers at >10 turns / >8k est. tokens,
  preserves 4 messages. No numeric-preservation contract, no memory flush, no offloading, no
  threshold ladder, no failure accounting, **0 tests**.
- `src/lib/ai/memory/extraction-memory.ts` — **74 lines, in-memory Map, never persisted**.
  There is no long-term memory: every report starts from zero.
- **Trajectory is in-process only** — `trajectory-emitter.ts` `EventEmitter` + 300-event ring
  buffer. Lost on restart, and **broken across serverless instances**, which is a deployment
  correctness problem given `Dockerfile`/`docker-compose.yml` exist.
- `SectionStore` versions are an **in-memory Map — lost on restart** (`report/section-store.ts:28`).
- Nothing preserves numeric fidelity across a compaction. In a 6-milestone run carrying a
  5-year 3-statement model, compaction is where numbers get lost.

**Remediation plan**

1. Rewrite `context-compactor.ts` as a 3-step ladder: (a) flush durable facts, (b) LLM
   compaction on the bulk model with a **mandatory numeric-preservation section** (port
   `compact.ts`'s 9-section contract, adapted to Indian financial fields: crores, FY periods,
   ratios), (c) truncate.
2. Require `activeToolResultCount >= 3` before compacting; count failures (max 3) then truncate.
3. Offload tool/section payloads >50K chars to `SandboxArtifact`-style storage with a pointer.
4. **Persist** the extraction memory in Postgres (new `AgentMemory` table: `planId`,
   `factType`, `content`, `embedding`, `createdAt`) and index embeddings for retrieval. Port
   the hybrid 0.7/0.3 + temporal-decay + MMR retrieval from Dexter's `memory/search.ts`.
5. Move `trajectory-emitter` to Postgres (`TrajectoryEvent` table) so SSE replay survives
   restarts and works across instances. Replay from DB on `GET /api/agent/stream?planId=`.
6. Persist `SectionStore` (or derive versions from `ReportHistory` + `AuditLog`).

---

### GAP-05 🟠 Agent Iteration, Reflection & Self-Critique

**Dexter implementation**

The loop is deliberately simple (`agent.ts:128-289`) — one `while` over `maxIterations=10`,
terminating when the model emits no tool calls. What makes it robust is the **advisory and
critique layer around it**:

- **Per-tool call budget advisory** — `scratchpad.canCallTool()`, `maxCallsPerTool: 3`
  (`scratchpad.ts:51`); over-budget calls inject *"you are at N/M"* as a HumanMessage so the
  model self-corrects.
- **Jaccard loop detection** — `scratchpad.findSimilarQuery()`, threshold `0.7`
  (`scratchpad.ts:52`): *"this query is very similar to a previous call"*.
- **Self-critique checklists embedded in skills**:
  - `dcf/SKILL.md` **Step 7 "Validate Results"** — three independent quantitative plausibility
    gates: EV within 30% of reported `enterprise_value`; **terminal value 50–80% of total EV**
    (>90% ⇒ growth too high; <40% ⇒ near-term projections aggressive); per-share cross-check vs
    `free_cash_flow_per_share × 15–25`.
  - `write-memo/SKILL.md` **Step 6 "Self-Critique Pass (Mandatory)"** — 7 checks: variant view is
    actually variant; every thesis bullet is **falsifiable** with a "wrong if" clause; numbers
    behind every adjective; bear case is steelmanned; **asymmetry ≥ 2x**; **probability weights
    sum to 100%**; tripwires are observable. `:187` — *"Do not skip the self-critique pass."*
  - `sector-wacc.md` — 11-sector WACC priors + adjustment factors and a **ROIC−WACC** check
    (*"If calculated WACC > ROIC, the company may be destroying value."*)
  - `x-research/SKILL.md` refinement heuristics ("too much noise → raise min_likes").
- **Prompt-level integrity discipline** — `memo-style.md:34-39`:
  *"Don't invent numbers. If you don't have it from a tool call, write 'not disclosed' or
  omit the line. Never fabricate consensus figures."*
- **Anti-guessed-URL rule** (`browser.ts:58-64`): NEVER construct URLs from patterns; take a
  snapshot and use the visible `/url`.

**EquiGen current state**

- `master-orchestrator.ts:150` is a **strictly sequential `for` loop** over milestones with a
  hardcoded `if/else` dispatch chain. `dependsOn` edges are **never evaluated** despite the
  "DAG"/"swarm" naming — so declared parallelism is cosmetic.
- **No reflection node, no plan revision, no re-planning, no critique agent.**
  `skipMilestones` is declared in `OrchestrationResult` and never populated.
- Agents are **6 module-level singletons statically imported** (`master-orchestrator.ts:14-19`).
  No registry, no dynamic spawn, no LLM-driven agent selection.
- **Synthesis consistency check runs after the fact and never triggers regeneration**
  (`synthesis-agent.ts:420-425`) — result is logged to SSE and stored, and
  `master-orchestrator.ts:442` uses `updatedSections` regardless.
- `ComplianceAgent` runs and `master-orchestrator` **ignores `auditResult` entirely**.
- `pipelineEval` is fire-and-forget (`:632`).
- Prompt-level integrity *is* strong (`synthesis-agent.ts:92-100`: "Use ONLY the data provided…
  Never invent numbers… say 'data pending [field]'"), and the **only genuine hard rule is
  excellent**: `central-client.ts:425-429` **throws** rather than fabricate.

**Remediation plan**

1. **Add a `reflect` milestone** between `synthesise` and `compliance_audit`: run
   `ConsistencyCheckerTool` over **all six sections** (not just `executive_summary`) with
   `extractedFinancials` actually passed (currently `undefined`, so the rating-vs-upside check
   can never fire), and on any `severity:"high"` finding re-run synthesis for **only** the failing
   section with the finding injected. Max 2 passes.
2. **Make blocking real**: `if (!complianceAudit.isCompliant) { force status 'pending_review' }`
   instead of ignoring `auditResult`.
3. **Port Dexter's Step-7 DCF validation gates into `financial-eval-engine.ts`** as checks
   `VAL_05..VAL_08`: (a) modelled EV within 30% of market EV, (b) **PV(TV)/EV in 50–80%**,
   (c) implied P/E on FCF per share in 15–25×, (d) **WACC < ROIC** for value creation. EquiGen
   already has the inputs for (b) — it just doesn't check it.
4. **Port the memo self-critique checklist** as an automated `ReportCritique` check: thesis
   bullets falsifiable, asymmetry ≥2×, probability weights sum to 100%, price target derived
   (not asserted).
5. Add per-tool advisory + Jaccard loop detection to `LoopSafetyGuard` (currently only step
   count + SHA-256 repetition; `maxTokensPerTurn: 25000` is **warn-only, never enforced** —
   `loop-safety.ts:85-89`).
6. Implement a **subagent registry** with tool allowlists and 1-level depth (§GAP-06), then
   parallelise independent milestones (`fetch_documents` ∥ `peer_benchmark`).
7. Honour `dependsOn` with a real DAG scheduler (topological, respecting `steering`).

---

### GAP-06 🟠 Subagent Isolation

**Dexter implementation** (`src/tools/subagent/`)

Three typed workers sharing a `WORKER_PREAMBLE`:

| Type | Tools | Iterations |
|---|---|---|
| `general-purpose` | 10 read-only tools | 8 |
| `research` | `web_search, x_search, web_fetch, read_filings, get_market_data` | 8 |
| `analysis` | `get_financials, get_market_data, stock_screener, read_filings` | 8 |

- `SUBAGENT_DISALLOWED_TOOLS = {spawn_subagent, ask_user_question, bash}` → **exactly one level
  deep**, no nesting, no side-effecting tools (they run in parallel and must not race).
- Subagents get `memoryEnabled: false` and no approval plumbing.
- **Only the final answer is returned** — intermediate events swallowed except
  `tool_start`/`tool_error`/`done`.
- Live progress over a sentinel-encoded channel (`progress.ts`: `'\u0001subagent-progress\u0001'`)
  with human rollups (*"Searched 3×, read 2 sources"*).
- Lazy `await import()` breaks the registry↔agent cycle.
- ⚠️ **Trust hole:** the parent receives prose + token count only — `spawn-subagent.ts:166-167`
  — so subagent output is unverifiable by the parent.

**EquiGen current state**

No spawning at all. 6 fixed singletons, hardcoded dispatch, full tool access to each, no
isolation, no per-agent budget, and `SubagentRun` DB rows record `inputJson`/`outputJson` but
nothing enforces allowlists. Concurrency exists only *within* agents
(`Promise.allSettled` for BSE+NSE, `CHUNK_CONCURRENCY = 2` in `parallel-extract.ts`), and
`synthesis-agent.ts:360` deliberately runs sections **sequentially** for rate limits.

**Remediation**

1. Add `SUBAGENT_TOOL_ALLOWLISTS` mirroring Dexter's matrix; enforce in the dispatcher.
2. Dynamic instantiation with a registry: `{ agentType, systemPromptOverride, toolAllowlist, maxIterations }`.
3. Cap subagent iterations; enforce `SUBAGENT_DISALLOWED_TOOLS` (no nesting, no side effects).
4. **Return the subagent's tool records, not just prose** — closes Dexter's trust hole: parent
   receives `{ answer, toolCalls, sources[] }` so its numbers stay auditable.
5. Persist per-subagent token/cost to `SubagentRun` and enforce a **plan-level cost ceiling**
   (currently `costEstimate` is computed and never enforced).

---

### GAP-07 🟠 Cache Discipline, TTL Semantics & Pagination

**Dexter implementation**

- **Named TTL constants** (`finance/utils.ts:10-14`) and a **volatility-aware policy**:
  news 15m · key-ratios snapshot 1h · historical ratios 6h · insider/13F/13D 1h · **statements,
  segments, earnings 24h** · SEC filing items 24h (*"SEC filings are legally immutable once
  filed"*) · **price snapshot: no TTL** · **historical OHLCV: cached only when the date window
  is closed** (`stock-price.ts:62-66`):
  ```ts
  const endDate = new Date(input.end_date + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const { data, url } = await api.get('/prices/', params, { cacheable: endDate < today });
  ```
  **You cannot get a stale open bar.** Excellent primitive.
- **Disk cache** (`utils/cache.ts`): deterministic order-independent key
  (sorted params + md5-12), TTL enforced at read (`:152-158`), **structural validation +
  self-healing deletion** of corrupt entries (`:97-119`) — corrupt ⇒ warn, delete, bypass.
  Tested (`cache.test.ts:81-109`).
- **Cursor pagination completed before the cache write** (`api.ts:54-70`) — *"...so caches only
  ever hold complete results."* Tested (`api.test.ts:38-99`).
- Embedding cache keyed by content hash; **wiped on provider fingerprint mismatch**.

**EquiGen current state**

- **No TTL semantics.** `next: { revalidate: 300 }` (Yahoo fundamentals, `yahoo-financials-tool.ts:396`),
  `60` (market data), `300` (news). Same 5 minutes for a price and a news item. No volatility
  tiers.
- **No corruption handling**, no structural validation.
- **Freshness is actively falsified** — `master-orchestrator.ts:518`:
  `fetchedAt: effectiveFin.fetchedAt ?? new Date().toISOString()`. A missing timestamp becomes
  "now", so `AUTH_02` (≤24h) **always passes**. Same pattern in `api/eval/run/route.ts:76`.
- `AUTH_02` is double-defanged: `isFresh = freshnessHours === null || freshnessHours <= 24` and
  it only ever emits `WARN`, never `FAIL` — **`null` ⇒ instant PASS**.
- **No pagination anywhere.** BSE `Peercomp`/`AnnSubCategoryGetData` responses are consumed
  whole; a truncated result is indistinguishable from a complete one.
- `AUTH_02` should key on **exchange trading days**, not wall-clock hours — a Friday 6pm fetch
  read Monday 10am is fresh.

**Remediation**

1. Add `src/lib/cache/` with Dexter's pattern: deterministic keys, TTL table, `isValidEntry()`
   structural check, self-healing delete. Replace every `next.revalidate`.
2. **Named TTLs tuned to Indian market hours** (IST, NSE/BSE 09:15–15:30): prices snapshot no
   TTL; daily OHLCV cacheable only for **closed trading sessions**; financials 24h; shareholding
   pattern 7d (quarterly filing); credit rating 7d; news 15m; concall 24h.
3. **Stop falsifying `fetchedAt`** — omit the field when unknown; make `AUTH_02` FAIL (not WARN)
   when `fetchedAt` is absent, and measure freshness in **trading sessions**, not hours.
4. **Add BSE pagination** for `AnnSubCategoryGetData` / `Peercomp`, and record
   `isTruncated`/`pageCount` on results so a partial fetch is *visible*.
5. Assert `isTruncated === false` before an agent milestone reports success.

---

### GAP-08 🟠 Data Provenance & Per-Datum Source Tracking

**Dexter implementation**

Tool-result level: `formatToolResult(data, sourceUrls)` (`tools/types.ts:1-12`) — every finance /
search / x-search tool attaches the **actual request URL** (`api.get` returns
`{data, url}`), `x_search` maps each tweet to its canonical URL (`x-search.ts:300`),
Perplexity merges `citations[]` + `search_results[].url` with dedup
(`perplexity.ts:62-72`). SEC filings additionally expose `accession_number` — a verifiable
anchor (`formatters.ts:341`). The scratchpad JSONL preserves it all offline.

Weaknesses: **URLs reach the model but nothing compels it to cite them**; no per-datapoint
`as_of`; and `stripFieldsDeep` **drops `currency`** from every statement
(`fundamentals.ts:7` → `REDUNDANT_FINANCIAL_FIELDS`), so the model can't even see the
denomination.

**EquiGen current state**

- `FinancialMetric` is `{ label; value; period; unit? }` (`types/index.ts:9`). `CompanyData`
  (`:45`), `FiveYearSummaryData` (`:87`), `QuarterlyFinancialData` (`:104`),
  `DetailedFinancialsData` (`:121`) carry **no `source`, `sourceUrl`, `pageNo`, `asOf`,
  `fetchedAt`, or `isLive`**. There is no "datum with provenance" type at all.
- Provenance exists only at coarse granularity: tool-level `isLiveData`/`dataSource`/`fetchedAt`
  (`yahoo-financials-tool.ts:71-74`), model-level `financialSource` enum
  (`modeling-agent.ts:43-51`), report-level `DataSourceSummary` (`synthesis-agent.ts:70-77`).
- `ReportSection.citations` is a `string[]` (`types/plan4.ts:205-210`) but is populated with
  **static source-*type* labels from the section definition**
  (`synthesis-agent.ts:361-392`), not anything the LLM cited.
  `citation_density` is claimed in `scripts/evaluate-agent-quality.ts:7` and **never measured**.
- `ComplianceCheck.category` includes `"source_citation"` (`types/plan4.ts:243`) — **no producer
  ever emits it**.
- `agentConfidence` is a binary placeholder detector:
  `content.includes("data pending") ? 0.2 : 0.85` (`synthesis-agent.ts:408`).
- `scrape_scrape` provenance exists as a `ScrapeJob` table — good, but not surfaced in output.
- `DocumentPage.pageNo` exists — so **page-level provenance is available but unused**.

**Remediation**

1. **Introduce a provenance-carrying datum type** — the single most valuable structural change:
   ```ts
   interface SourcedDatum<T> {
     value: T;
     source: 'bse_exchange_api' | 'nse_exchange_api' | 'yahoo_finance' |
             'filing_pdf' | 'derived' | 'model_estimate';
     sourceUrl?: string;
     accessionNumber?: string;   // BSE/NSE announcement ref
     pageNo?: number;            // DocumentPage linkage
     asOf: string;               // ISO — vendor period, NOT fetch time
     fetchedAt: string;
     isLive: boolean;
   }
   ```
   Then make `FinancialMetric.value`, `CompanyData.*`, `FiveYearSummaryData.*` and
   `DetailedFinancialsData.*` carry it. A `DerivedDatum` must additionally name its inputs.
2. **Render provenance in the UI and PDF**: each figure gets a source chip
   (`BSE · 12-Mar-2026` / `Filing p.42` / `Derived from DCF`). This is a *sellable* feature for
   institutional users — the reason Dexter's audit trail matters and the reason EquiGen's
   competitor-analyst users will ask for it.
3. Fix the **false badges** in `html-report-generator.ts:3103-3117` — currently prints
   unconditional *"Verified"*, *"Investment Grade"*, *"Audited Inputs"* even when
   `dataSources.creditRating.found === false` and the DCF used `sector_fallback`. `dataSources`
   is accepted at `:1758` and never consulted. **This is the most damaging correctness bug in
   the PDF.** Also fix `:1283` `As of ${new Date()}` (render time) → real `asOf`.
4. Populate `ReportSection.citations` from actual `SourcedDatum` ids referenced while generating,
   and **measure** `citation_density`.
5. Replace `agentConfidence` heuristic with real signals: fraction of the section's figures that
   are `isLive` vs `derived` vs `model_estimate`.

---

### GAP-09 🟠 Output Grounding & Claim Verification

**Dexter implementation** — honest assessment: **very weak.** No mechanism extracts numbers from
the narrative and compares them to tool results. `handleDirectResponse` (`agent.ts:454-468`) is a
pass-through; `toolCalls` is attached for the UI only. The one anti-fabrication boundary in the
whole repo is **insider-name resolution** (`insider_trades.ts:71-93`):

```ts
// ...Output is validated against the candidate list so a hallucinated name
// can never reach the API.
const matched = NameMatchSchema.parse(response).matches;
const valid = new Set(candidates);
return matched.filter(m => valid.has(m));
```

Three layers: zod `outputSchema` + `.parse()`, a prompt forbidding cross-person matches, and a
**`Set` allowlist filter against the authoritative vendor list**. Same pattern for CIK
resolution (`institutional_holdings.ts:51-61`) — the model cannot invent a CIK.

**EquiGen current state**

- `ConsistencyCheckerTool` (108 lines) is the only numeric grounding check. It regex-scrapes
  the narrative and diffs against the model:
  1. target price — `>5%` mismatch ⇒ `severity:"high"`
  2. rating vs upside — `upside > 15%` with `SELL|REDUCE|UNDERPERFORM` ⇒ high
  3. WACC string drift ⇒ warning
- **Coverage: 3 fields.** No check on revenue, EBITDA, PAT, margins, net debt, share count.
- **Called for one section only** — `executive_summary` (`synthesis-agent.ts:420-425`) — and
  `extractedFinancials` is passed as `undefined`, so check #2 **can never fire in production**.
- **Non-blocking**: written to `SubagentRun.outputJson` and SSE; no branch reads
  `isConsistent` or `score`; `master-orchestrator.ts:442` proceeds regardless.
- **Type bug**: `foundWacc = \`${waccMatches[1]}%\`` (a percent string) compared to
  `assumptions.wacc` which is a **number** (`0.115`) in `ModelingAgent` output but a percent
  string after `computeDCFValuation` (`:359`) ⇒ spurious warnings.
- **No citation rendering anywhere** in EquiGen (nor in Dexter).
- **No post-generation verification pass on the agent path.** Only the *document-upload* path
  has the LangGraph `audit_financials` node + conditional edge.

**Remediation** — this is where EquiGen can exceed both projects.

1. **Extend `ConsistencyCheckerTool` to a full numeric reconciler.** Walk every `SourcedDatum`
   used to generate a section; extract numbers from the rendered text; assert each appears
   (allowing formatting/units). Report `{ field, expected, found, deltaPct, severity }`. Expand
   from 3 fields to the full metric set — this is a mechanical, high-value extension.
2. **Actually pass `extractedFinancials`** and **loop back** on `severity:"high"` (see GAP-05).
3. Fix the WACC type comparison (normalise both to percent numbers).
4. **Port Dexter's allowlist-validation pattern to ticker resolution**: validate the
   LLM-extracted peer ticker set against a real NSE/BSE symbol universe before querying
   Yahoo — a hallucinated ticker currently produces a confusing null path
   (`ticker-resolver.ts:122-129`). Same for BSE scrip codes.
5. **Claim→source binding**: require the synthesis prompt to emit
   `[[claim-id]]` markers and resolve each to a `SourcedDatum`; render an
   "Unsourced claims: N" badge. Unresolved markers ⇒ block publish.
6. **Add a post-synthesis verification node** to the LangGraph *agent* path (mirroring
   `audit_financials`) that validates the assembled report, not just the extraction.

---

### GAP-10 🟠 Skills / Methodology System

**Dexter implementation** (`src/skills/`, 4 files)

- **Registry + loader + progressive disclosure** (`registry.ts`, `loader.ts`, `skill.ts`):
  the `skill` tool (`:37`) returns the full `SKILL.md` body on demand and **rewrites relative
  `.md` links to absolute paths** so `read_file` can fetch them.
- Skills discovered conditionally; **once-per-query dedup** (`tool-executor.ts:99-102`,
  `scratchpad.hasExecutedSkill()`).
- `dcf/SKILL.md` (4.6 KB) + `sector-wacc.md` — the complete valuation methodology, including
  growth haircuts (*"Stable FCF history → CAGR with 10-20% haircut; **Cap at 15%**"*),
  WACC defaults, growth decay, the 3 sensitivity cases, and **Step 7 validation**.
- `write-memo/SKILL.md` (10.7 KB) + `memo-style.md` + `memo-template.html` (9.4 KB) +
  `examples.md` — **the HTML memo template is a first-class artifact**: templated slots
  (`price_target_base`, `thesis_bullets`, `scenario_table`, `catalysts_table`, `risks_table`,
  `monitoring_kpis`, `prob_weighted_return`, `asymmetry`, …).
- `x-research/SKILL.md` — X-specific query syntax + refinement heuristics.

The architectural insight: **methodology lives in versioned, reviewable Markdown separate from
prompt code**, so analysts can improve research process without touching TypeScript. It also
keeps the system prompt small (progressive disclosure).

**EquiGen current state**

- **Zero prompt files.** Every prompt is an inline template literal:
  `synthesis-agent.ts:92` (9-line system prompt), 6 section builders (`:130-313`),
  `langgraph-pipeline.ts:416,479,593,719`, `agent-orchestrator.ts:214-277`,
  `central-client.ts:208-239`, `sebi-compliance-tool.ts:55-79`,
  `concall-transcript-tool.ts:171-194`, `sector-news-deep-tool.ts:128-137`,
  `master-planner.ts:179-180`, `parallel-extract.ts:239-241`.
  No `prompts/` directory, no versioning, no A/B, no review surface.
- Valuable content is buried in comments — e.g. the sector-fallback disclaimer logic at
  `synthesis-agent.ts:231` and the "do NOT use training data" rules at `:190-192`.
- Report rendering is a **120 KB `html-report-generator.ts`** rather than a template with slots
  — no per-firm customisation, no golden-file testability.

**Remediation**

1. Create `src/lib/ai/prompts/` with one `.md` file per prompt, each carrying a `promptVersion`
   constant. Already half-built: `ChunkExtraction.inputHash` includes
   `promptVersion[extractType]` — so **the invalidation mechanism exists and is unused**.
2. Extract methodologies as skills: `dcf-india/SKILL.md`, `forensic-audit/SKILL.md`,
   `sebi-compliance/SKILL.md`, `equity-memo/SKILL.md`, `concall-extraction/SKILL.md`.
3. Move `html-report-generator.ts` to a **slot-based template** (as Dexter's
   `memo-template.html`) — enables golden-file tests, per-firm white-label templates
   (`Organization.primaryColor` already exists), and org-authored templates.
4. Add a `promptVersion` bump → invalidates cached `ChunkExtraction` rows automatically.

---

### GAP-11 🟠 Permission / Safety Engine

**Dexter implementation** (`src/permissions/`, 5 files, 4 test files)

- **Shell tokenizer/segmenter** (`command-parser.ts`) — **fail-closed on unknown syntax**.
- **Rule grammar** (`rules.ts`) — Claude-Code-style `Bash(git status:*)` allow/ask/deny with a
  **security floor**.
- **Decision engine** (`engine.ts`) — precedence-tested; adversarial corpus of **57 malicious
  commands** (`engine.test.ts:102-126`).
- **Read-only classifier** (`read-only.ts`) — 48-case matrix test.
- Session-keyed grants; `defaultBashDecision`.

**EquiGen current state**

- **One control:** `DANGEROUS_PATTERNS` static blocklist in `python-executor.ts:34-39,52-66`
  (`import os|subprocess|sys`, `eval(`, `exec(`, `open(`, `__subclasses__`, …). On violation the
  artifact is persisted with `exitCode 1` and nothing executes — good fail-closed design.
- **Zero tests** for that blocklist.
- `Puppeteer` scraping (`puppeteer-client.ts`) runs with **no URL allowlist** — a prompt-injected
  URL could reach internal hosts (SSRF surface).
- No tool-level permission model: every subagent/tool has full access.

**Remediation**

1. **Add a URL allowlist** to `puppeteer-client.ts` (BSE/NSE/Screener/Google News hosts) + block
   private IP ranges and `localhost`. High-value, low effort.
2. Test `DANGEROUS_PATTERNS` with an adversarial corpus (port Dexter's style) including
   obfuscation (`getattr`, `__globals__`, string concatenation, base64 exec).
3. Add a permission tier per tool: `auto` (read-only data) / `confirm` (writes, exports) /
   `deny` (network exfil).
4. Sanitise LLM-supplied tickers/URLs against an allowlist before any fetch (see GAP-09.4).

---

### GAP-12 🟡 LLM Provider Breadth, Routing & Failure Taxonomy

**Dexter implementation**

- **9 providers** in one registry (`src/providers.ts`) — "add a single entry here; all other
  modules derive from it": OpenAI (ctx **1,047,576**), Anthropic (200k), Google (1M), xAI (131k),
  Moonshot (131k), DeepSeek (1M), OpenRouter (128k), Ollama, Ollama-cloud.
- **Fast/slow model separation** — every provider declares a `fastModel`, used for compaction,
  memory flush, `web_fetch` summarisation, and insider-name matching. **This is how Dexter keeps
  cheap work cheap.**
- **Prefix-based routing with default fallback** (`providers.ts:99-104`).
- **Provider-specific correctness handling**: OpenAI `useResponsesApi` for the GPT-5.6 family
  (*"requires the Responses API when reasoning and function tools are combined"*, `llm.ts:151`,
  asserted by `model/llm.test.ts`); **Anthropic `cache_control: {type:'ephemeral'}`** on the
  system prompt (~90% input-token saving); DeepSeek `reasoning_effort:'high'` + `thinking`.
- Anthropic prompt caching matters at 200k context — EquiGen has no equivalent.
- `.dexter/settings.json` config with **legacy→new model auto-upgrade** on load.

**EquiGen current state**

- **3 providers** (`langchain-service.ts:20-75`): Groq (`openai/gpt-oss-120b`), OpenRouter
  (`llama-3.3-70b-instruct`), OpenAI (wired but `OPENAI_API_KEY` is **absent from both
  `.env.example` and `.env`**).
- **Two divergent fallback ladders that don't agree:**
  - `model-router.ts:68-105` → Groq 20b → OpenRouter 70b → throw
  - `central-client.ts:357-429` → Groq 120b → Groq `qwen/qwen3.8-27b` → OpenRouter 70b → throw
    (`model-router` never includes qwen, despite its registry entry declaring `tpd: 97000`)
- **No fast/slow model separation** — compaction and summarisation use the same expensive model.
- **No prompt caching** anywhere.
- **Budget tracking excludes OpenRouter** (`recordActualUsage`, `model-router.ts:268`:
  `if (modelName.includes("/")) return;`) — silently unbounded spend on the fallback path.
- **Strong, genuinely better infrastructure Dexter lacks:**
  `TokenBudgetManager` 60s sliding window + Postgres bucket; **TPD daily budget** with model
  swap before Groq's cap (`model-router.ts:212-227`); **live limit discovery** probing
  `x-ratelimit-*` headers into a `ModelLimit` table (`budget/limit-discovery.ts`); token
  estimator tuned for financial text (`length/2.8` + 1200 completion buffer, `rate-limiter.ts:158`).
  Keep all of this.
- Groq's 2026 free tier is ~6k TPM / 30 RPM per the comment at `model-limit-registry.ts:5-8` —
  model IDs still named `PRIMARY_70B`/`BULK_8B`/`VISION_11B` while pointing at `gpt-oss-*`
  (legacy Llama-era naming; a readability trap).

**Remediation**

1. Unify into **one registry + one ladder** (Dexter's `providers.ts` pattern) — kill the
   duplication between `model-router` and `central-client`.
2. Add `fastModel` per provider; use it for compaction, context summaries, peer-name resolution,
   chunk classification.
3. Enable Anthropic prompt caching if Anthropic is added; add `OPENAI_API_KEY` to `.env.example`.
4. **Include OpenRouter in budget accounting** (or hard-cap it explicitly).
5. Fix `MODEL_IDS` naming to describe actual models.
6. Keep and document the rate-limit discovery — it is a genuine advantage.

---

### GAP-13 🟡 Interfaces & Automation (Dexter-only, mostly N/A for EquiGen)

**Dexter implementation**

- **CLI TUI** (`src/cli.ts`, 865 lines, `@mariozechner/pi-tui`), 8 slash commands with
  autocomplete, `/model` 5-state wizard writing keys into `.env` at runtime, per-tool live
  spinners, 32ms render throttle, `Esc` double-tap interrupt.
- **WhatsApp gateway** (`src/gateway/`, 20+ files): inbound → mention detection → route
  resolution → per-session serialisation (`session.tail = session.tail.then(run, run)`) →
  allowlist re-check → typing indicator → agent run → markdown cleanup. Access control with
  `dmPolicy: pairing|allowlist|open|disabled`, 6-digit pairing codes, 30s grace window to
  suppress replayed pairing messages, E.164 normalisation, exponential reconnect with jitter.
- **Cron** (`src/cron/`): `at`/`every`/`cron`(croner, tz), `keep`/`once`/`ask` fulfilment,
  exponential backoff `[30s,1m,5m,15m,60m]`, one-shot disable after 3 errors, **atomic writes**
  (tmp + rename), heartbeat checklist.
- **Memory flush before compaction** + `HEARTBEAT.md`.

**EquiGen current state** — web-only. `AgentChatView`, `SteeringPanel`, `TrajectoryFeed`,
`LivingDraftPanel`, `GoalTerminal` give **real-time steering** (pause/resume/cancel), which
Dexter lacks entirely and which is arguably better for institutional desk work.

**Recommended (genuinely useful):**
1. **Scheduled/monitored coverage** — cron-equivalent via a queue worker: re-initiate coverage
   on results dates, refresh ratings, alert on rating actions. EquiGen already has
   `queue/worker.ts` + `batch-processor.ts` + `cron`-ready Postgres.
2. **Report digests / email or Slack delivery** of published notes.
3. **A `/health` + data-source status page** — which sources are live/stale right now
   (Dexter's `_errors` array, promoted to a UI surface).

**Not recommended:** WhatsApp gateway, TUI. Wrong surface for a multi-tenant institutional
product.

---

### GAP-14 🟡 Trajectory Persistence & Reproducibility

**Dexter implementation**

- **Append-only JSONL scratchpad** (`src/agent/scratchpad.ts`) — *"single source of truth for
  all agent work on a query."* Filename `.dexter/scratchpad/YYYY-MM-DD-HHMMSS_<md5-12-of-query>.jsonl`.
  Entry types `init | tool_result | thinking`; results JSON-parsed when possible before write;
  **malformed lines are skipped** so one corrupt line can't crash context assembly
  (`:475-485`). Documented in `README.md:140-160` as the primary debugging mechanism.
- **Verifiable post-hoc replay** of every tool call with args and results.

**EquiGen current state**

- `trajectory-emitter.ts` — in-process `EventEmitter` + **300-event ring buffer**;
  `GET /api/agent/stream` replays from memory. **Lost on restart; broken across instances.**
- `SubagentRun`, `ScrapeJob`, `ToolCall`, `AuditLog`, `SandboxArtifact` tables *do* persist
  provenance — good — but `ToolCall` appears unused for the main agent path and there is no
  **single replayable transcript** per run.
- No seed/manifest for Monte Carlo ⇒ results are **not reproducible** (see GAP-16).

**Remediation**

1. New `TrajectoryEvent` table (`planId`, `seq`, `type`, `payload Json`, `createdAt`) with a
   unique `(planId, seq)`; write through the emitter; SSE replays from DB.
2. Assemble a **per-run transcript artifact** (`AuditLog` + `SubagentRun` + `ToolCall` +
   `TrajectoryEvent` + `ScrapeJob`) downloadable from the UI — this is the institutional
   "show your work" feature.
3. **Never let a run report success without a persisted report** (`master-orchestrator.ts:606`).

---

### GAP-15 🟡 Prompt & Model Input Hygiene

**Dexter implementation**

- **Prompt clamp** and generous budgets; microcompact clears old reasoning but keeps the last
  2 AIs' `tool_calls` intact (`stripOldThinking`).
- **Tool-result budgets** — 50K per result, 200K per turn, persisted to disk with a pointer.
- `ask_user_question` (1–4 MCQs mid-turn) with graceful degradation to
  `UNAVAILABLE_MESSAGE`/`DECLINED_MESSAGE` when there's no interactive user.
- Tool descriptions carry both `description` and a **`compactDescription`** for context-efficient
  listings (`registry.ts`).

**EquiGen current state**

- Prompt clamped to 20,000 chars (`api/agent/chat/route.ts:41`) — reasonable.
- Provider allowlist `groq|openai|openrouter` on that route — good.
- **No tool-result budget**: large extracted financials / HTML reports go straight into context.
- No mid-turn clarification mechanism; `CorrectionProposal` covers report *edits*, not ambiguity.
- `System` prompts duplicate tool schemas inline (`agent-orchestrator.ts:214-277`).

**Remediation**

1. Add a tool-result budget (persist >50K to `SandboxArtifact`, cap 200K/turn).
2. Add a lightweight `ask_user_question` for the *planning* stage: "Depth: quick/standard/deep?"
   is already a modal — expose it inline for autonomous runs.
3. Add `compactDescription` to tool definitions; strip full schemas from the copilot prompt.

---

### GAP-16 🟡 Reproducibility of Stochastic Computation

**Dexter implementation** — Monte Carlo is *prompt-driven*, not code, so N/A. Its reproducibility
mechanisms are the eval dataset hash + seeded sampling + LangSmith run records.

**EquiGen current state**

- `python-executor.ts:304-344` Monte Carlo uses **`Math.random()`** — **non-deterministic,
  non-reproducible**. Percentile indexing is hardcoded: `mcSims[100]`, `mcSims[500]`, `mcSims[900]`.
- `runThreeStatementModel` bull/bear are **fixed multipliers** `×1.22` / `×0.81`
  (`three-statement-engine.ts:320-321`); `modeling-agent.ts` Python path uses `×1.25` / `×0.78`.
  Two engines, two answers.
- **Two divergent DCF engines**: Python subprocess (`modeling-agent.ts:436-499`) vs TS
  `computeDCFValuation` (`python-executor.ts:222-381`) — different FCFF, different bull/bear.
- The **sensitivity grid re-implements a simplified FCFF**
  (`rev × margin × 0.85 × (1−tax) − rev × capexPct`) ignoring DSO/DIO/DPO and the capex schedule
  ⇒ **the displayed matrix is not consistent with the headline target price.**
- `runThreeStatementModel` has **no divide-by-zero guard** on `(wacc − terminalGrowth)` (`:312`)
  or `sharesOutstandingCr` (`:318`); `Math.max(1, …)` on the result lets `NaN` through. Only the
  sensitivity matrix guards (`if (sWacc <= sTg) push(0)`).
- **Net debt double-subtracted** in `computeDCFValuation`: the model returns
  `equityValue = EV − netDebt` internally, then the wrapper recomputes it at `:272` while the
  model's base cash/debt were themselves split from the same `netDebt` (`:253-254`). No test
  catches it (`python-executor.test.ts:53` uses the same `netDebt` on both sides).
- **WACC is hardcoded and mislabeled**: `rf = 0.07`, `erp = 0.055`,
  `wacc = clamp(rf + beta × erp)` (`modeling-agent.ts:378-380`) — that is **cost of equity**,
  not WACC. Cost of debt is a flat `0.085` despite `credit-rating-tool.ts` existing. No live
  10Y G-Sec fetch, no target D/E.
- `valuation-bands-engine.ts:180-214` `generateSyntheticHistory()` fabricates a **sinusoidal**
  series when Yahoo returns <12 candles — and the tests
  (`valuation-bands-engine.test.ts:57-104`) exercise **exactly that synthetic path**, i.e. the
  tests validate fabricated data.
- `ScenarioModeler.tsx:45-46,174-185` has the **best guard in the repo** — refuses to run when
  `baseRevenue`/`sharesOutstandingCr` are null ("will not run on synthetic fallback values") —
  but it has **zero tests**.

**Remediation**

1. **Collapse to one DCF engine** (TypeScript). Delete the Python DCF or make it a thin
   presentation script that calls the TS engine. Fix the double-subtracted net debt.
2. Make the sensitivity grid call the **same** FCFF function as the headline valuation.
3. Add guards: `wacc > terminalGrowth` asserted at entry; `sharesOutstandingCr > 0` asserted.
4. **Seeded RNG** (mulberry32/xorshift) + persist `{ seed, iterations, distribution }` to
   `SandboxArtifact`. Percentiles by index rather than magic offsets.
5. Derive bull/bear from the Monte Carlo p90/p10 (already available) instead of fixed
   multipliers — delete `×1.22/×0.81` and `×1.25/×0.78`.
6. **Implement real WACC**: fetch the India 10Y G-Sec (or accept a dated manual input), derive
   cost of debt from the **actual credit rating** returned by `credit-rating-tool`, use a target
   D/E, weight properly. Rename the current variable so nobody mistakes CoE for WACC.
7. **Delete `generateSyntheticHistory`** or gate it behind an explicit
   `allowSyntheticHistory: true` with a loud UI/PDF watermark. Fix the tests to use a real
   recorded series fixture.

---

### GAP-17 🟡 Financial Data Correctness — Shared and Dexter-Specific

Both projects have real gaps here. Items marked **(E)** are EquiGen issues.

**Indian units (E, good)**
- `parseIndianNumber` (`table-extractor.ts:73-100`) correctly handles crore/lakh/mn/thousand,
  `(12.5)` → negative, ₹/$, `en-IN` grouping. **8 unit tests — the best-covered Indian numeric
  surface in either project.**
- Missing: a first-class crore↔lakh converter; display helpers use ad-hoc `/100000`
  (`utils/index.ts:19-23`, `ScenarioModeler.tsx:122-127`).
- `langchain-service.ts:88-92` handles `mn`→Cr (`/10`) — correct.
- `yahoo-financials-tool.ts:102-106` `toCrores` **returns `null` for non-INR** rather than
  silently mis-converting — good, and tested.
- **₹ mojibake ships in output** (`api/eval/route.ts:30`, `ScenarioModeler.tsx:628,708`,
  `Architecture.md:293`) while `math-sumprecise-polyfill.ts:9-11` documents that ₹ glyphs
  break in financial PDFs. Fix + add a `\uFFFD` assertion to output tests.

**BSE FY aggregation (E, wrong)**
- `bse-financial-data-tool.ts:212-232` **sums all quarterly rows of an FY into one "annual"
  figure** and takes **`Math.max()` of quarterly EPS** as an "annual EPS proxy" — then
  `master-orchestrator.ts:566` labels the result `period: "TTM"`. So a cumulative-FY number is
  presented as trailing-twelve-month.
- **Fix:** store quarters; compute FY = sum(revenue) but **EPS = sum of quarterly EPS** (or
  PAT/shares), and label `FY` vs `TTM` correctly. Add a unit test with a pinned fixture.
- Also `.slice(0, 5)` keeps only 5 years.

**Drifting hardcoded maps (E)**
- BSE scrip codes duplicated with **divergent keys**: `yahoo-financials-tool.ts:265-279` (51
  entries, `BAJAJ_AUTO`) vs `bse-financial-data-tool.ts:72-90` (48 entries, `BAJAJAUT`,
  `BAJFINANCE`, `TECHM`), plus a third partial regex in `valuation-bands-engine.ts:280`.
- `financial-eval-engine.ts:485` infers exchange from suffix:
  `ticker.endsWith(".BO") ? "BSE" : "NSE"` — **a bare `RELIANCE` is claimed as NSE without
  verification.**
- **Fix:** single `src/lib/market/securities-master.ts` (ticker → BSE scrip code, NSE symbol,
  sector, ISIN), loaded once, unit-tested, used by every tool.

**Fiscal year (E, correct)** — Apr–Mar logic is right in 3 independent places
(`three-statement-engine.ts:177-178`, `modeling-agent.ts:432-434`,
`bse-financial-data-tool.ts:204-205`). ✅ Keep. BSE date parsing handles ISO `YYYYMMDD`,
`DD/MM/YYYY`, `Mon YYYY` ✅.

**Dexter's financial weaknesses (do NOT copy)**
- **No financial math in TS at all.** Every formula is prose in `dcf/SKILL.md` executed by LLM
  arithmetic. Formula ambiguity is real: *"5% annual decay (multiply growth rate by 0.95,
  0.90, 0.85, 0.80)"* is internally inconsistent, and **no explicit `1/(1+WACC)^t` formula is
  given**.
- **`stripFieldsDeep` drops `currency`** from every statement → the model can't see the
  denomination.
- **`fmtNum` uses `toFixed(1)`** → `$9.99B` renders `10.0B`; the model sees only the rounded
  string and cannot recover the exact figure. Combined with dropped currency, this is
  Dexter's most likely silent failure mode. **EquiGen must never abbreviate before the model
  sees the value.**
- No statement integrity: no `A = L + E`, no CF↔BS cash tie, no EBITDA-from-OPM derivation.
- No unit conversion, no FX (USD-only).
- Hardcoded `rf = 4%`, tax `30%`, terminal growth `2.5%`; no live G-Sec.

---

### GAP-18 🔴 Cross-Tenant & Auth Defects (EquiGen-specific security gaps)

Not a Dexter comparison (Dexter is single-user local), but a **blocker for real institutional
multi-tenancy**, and it belongs in this document.

| # | Defect | Evidence | Severity |
|---|---|---|---|
| 1 | **`GET /api/eval/run` has zero auth and zero org filter** — `findFirst({ where:{ companyName:{contains:ticker} } })`. `requireApiSecret`/`getAuthSession` never imported. Any tenant can read any tenant's report payload, `financialAudit`, `forensicAnalysis` and section text by guessing a ticker. | `api/eval/run/route.ts:37-48` | 🔴 |
| 2 | `api/valuation-bands/route.ts` performs no auth call in the handler (relies on middleware only) and accepts arbitrary tickers. | route | 🟠 |
| 3 | **`requireApiSecret` trusts spoofable `x-user-id`/`x-org-id` headers** if `userId && orgId` are present. Middleware overwrites them for matched paths, but it's a defense-in-depth violation. | `lib/utils/auth.ts:8-13` | 🟠 |
| 4 | **Hardcoded shared secret** `"equigen-internal"` accepted in any non-production env, granting `ADMIN` over `default-org`; shipped in `playwright.config.ts`. If `NODE_ENV` is unset this becomes a production bypass. | `middleware.ts:57-72` | 🔴 |
| 5 | **`pathname.includes(".")`** excludes *any* dotted path from auth (e.g. `/v1.5/report`). | `middleware.ts:16` | 🟠 |
| 6 | **`default-org` is a super-tenant** in 6+ routes (`history`, `agent/chat`, `agent/session`, `agent/cancel`, `agent/modify`) — every `orgId:null` (all pre-tenancy reports) and demo report is visible to any `API_SECRET` holder. | e.g. `history/route.ts:62,66` | 🔴 |
| 7 | **Inconsistent admin check**: `role === "ADMIN"` (uppercase) in most routes vs `role?.toLowerCase() === "admin"` in `approve/route.ts:74` → `isSystemAdmin` is effectively always false for real users. | multiple | 🟡 |
| 8 | **`ReportHistory.contentHash` is written but never verified on read** — tamper-evidence that doesn't detect tampering. | `utils/hash.ts`, `approve/route.ts:155` | 🟠 |
| 9 | Only **one** tenancy test exists (403 on foreign `reportId` in `agent-chat-and-modify.test.ts:311-335`). No coverage for `history`, `download`, `approve`, `excel/export`, `audit`, `proposals`, `eval/run`. | `tests/` | 🔴 |
| 10 | API-key decryption failures swallowed (`.catch(() => null)`) in 10 routes — a corrupt key silently downgrades to the org default. | e.g. `agent/execute/route.ts:26` | 🟡 |

**Remediation:** a single `requireOrgSession(req)` helper used by **every** route that (a)
verifies the JWT itself rather than trusting headers, (b) returns `{userId, orgId, role}` and
(c) never grants super-tenant semantics. Remove the `default-org` escape from all read paths;
require explicit `orgId` scoping everywhere. Delete the `equigen-internal` literal from
`playwright.config.ts` (read from env). Fix the role case mismatch centrally. Add a
`tests/unit/tenancy/*.test.ts` matrix asserting 403 across **all** org-scoped routes.

---

### GAP-19 🔴 Live Synthetic-Fabrication Paths Still Reachable (EquiGen-specific)

These are not "features Dexter has" — they are **correctness landmines** that undercut the
anti-fabrication engine you already built.

| # | Path | Evidence | Impact |
|---|---|---|---|
| 1 | **`FAILED_UNRELIABLE` never blocks.** 8 grep hits: enum (`financial-eval-engine.ts:20`), assignment (`:461`), and **only display logic** (`FinancialHero.tsx:107` red banner). No route, no state transition, no export gate reads `financialAudit.verdict`. | — | 🔴 A report certified unreliable can still be downloaded and Excel-exported. |
| 2 | **Autonomous pipeline writes reports as `status:"published"`**, bypassing `transitionReportStatus`, `qualityAck`, SEBI sign-off, and setting no `dataQuality`. | `master-orchestrator.ts:585-605` | 🔴 Defeats the entire compliance lifecycle. |
| 3 | **`generateDynamicFinancialModel()`** builds a complete 5-year Geojit-style dataset from `hashString(companyName+ticker)` — fake shareholding `[51.2,51.2,51.2]`, fake `"Nil"` pledge, fake Sensex `78,520`, and a `valuationAnalysis` string asserting *"Our DCF model assumes an 11.5% WACC… target price of Rs. X"*. Reachable from `/api/download` when no `ReportHistory` row exists — and **before the tenant check** (line 128). | `institutional-equity-data.ts:171-566`, `download/route.ts:98` | 🔴 Fabricated research note, reachable unauthenticated-relative-to-org. |
| 4 | **`/api/agent/steer` returns fabricated audit results** into the live SSE stream: `"BALANCED"`, `"balance_sheet_variance":"₹0.00 Cr"`, `"items_checked":28`, SEBI `"PASSED_100_PERCENT"` score 100, DCF `"revised_fair_value:914.5"` — hardcoded, no computation. | `api/agent/steer/route.ts:66-227` | 🔴 Fabricated verification theatre shown as if executed. |
| 5 | **`generateSyntheticHistory()`** sinusoid valuation bands, silently substituted on network failure. | `valuation-bands-engine.ts:180-214, 266-268` | 🔴 |
| 6 | **PDF prints unconditional provenance badges** — *"Verified"*, *"Investment Grade"*, *"Audited Inputs"* — even when `creditRating.found === false` and the DCF used `sector_fallback`. `dataSources` is accepted at `:1758` and never consulted. | `html-report-generator.ts:3103-3117` | 🔴 Worst single correctness bug in the shipped artifact. |
| 7 | **`isSyntheticModel` is a dead flag** — written at `institutional-equity-data.ts:50`, read nowhere, not in the `EquityResearchData` interface. | 2 grep hits | 🟠 |
| 8 | **Forensic inputs are partly fabricated**: `forensic-agent.ts:71-74` *derives* current assets/liabilities from `totalDebt × 0.8 × currentRatio`; `receivablesCr` is **never populated**, so the working-capital stress check at `forensic-accounting-tool.ts:199` **can never fire**; `auditorQualificationText` is never populated, so auditor is **always "Clean"**; `workingCapitalCycleDays` is **hardcoded `null`** (`:295`). | — | 🔴 The forensic panel displays computed-looking values derived from guesses. |
| 9 | **`Altman Z` and `Beneish M` are proxies, not the real models.** Z substitutes missing inputs with magic numbers (`0.15`, `0.4`, `4.5`, `1.2`, and a `500` Cr total-assets fallback). Beneish is a 1-variable accrual proxy — self-documented *"synthetic Beneish proxy"* — and **returns a passing `-2.35` when inputs are missing**. `Architecture.md:238` claims the *"8-variable model"*. | `forensic-accounting-tool.ts:106-189` | 🔴 Misrepresented methodology in a compliance artifact. |
| 10 | **`balanceSheetDiff` is `0` by construction**, so `BS_01` is **structurally unfailable** on the real pipeline — it only fails if a different producer supplies a diff. | `three-statement-engine.ts:247`; `python-executor.ts:268` | 🟠 A green check that proves nothing. |

**Remediation**

1. **Enforce the verdict**: `FAILED_UNRELIABLE` → force `status:'pending_review'`, block
   `/api/download` and `/api/excel/export` with HTTP 409 unless an explicit
   `overrideWithJustification` AuditLog entry exists.
2. **Route the autonomous pipeline through `transitionReportStatus`** — never write
   `published` directly. Set `dataQuality` from the eval verdict; require `qualityAck`.
3. **Delete `generateDynamicFinancialModel()`**, or move it behind a build-time flag that is
   **impossible in production** (`if (process.env.NODE_ENV === 'production') throw`). Fix the
   `/api/download` tenant-check ordering regardless.
4. **Delete the hardcoded steer payloads**; if `redirect` needs UI feedback, emit a real
   `SteeringEvent` with `payload` = what the user asked, not a fake tool result.
5. **Make the PDF provenance badges conditional** on `dataSources` + `financialAudit.verdict`;
   add `"Synthetic"` / `"Sector fallback"` states. Use the real `asOf`.
6. **Refuse to display a computed forensic panel when inputs are missing.** Return
   `forensicAnalysis: null` with `reason: 'insufficient_inputs'` and render "Forensic audit
   requires receivables, current assets/liabilities and auditor opinion — not available from
   exchange APIs" instead of magic-number output. Or genuinely source them (BSE `DefaultData`
   has balance-sheet lines; Yahoo has `currentAssets/currentLiabilities/totalReceivables`).
7. **Either implement the real 8-variable Beneish model and the true Altman inputs, or relabel
   the outputs** (`"Accrual Quality Proxy"`, `"Distress Proxy"`) and remove the
   `Architecture.md:238` claim. Never report `auditorQuality:"Clean"` when never checked —
   return `"Not assessed"`.
8. Add a **cross-foot check against the source** (parsed PDF/filings), not only internal model
   consistency, so `BS_01` can actually fail.
9. Delete `isSyntheticModel` or wire it into `EquityResearchData` + the UI + PDF watermark.

---

### GAP-20 🟡 Schema Validation Coverage

**Dexter** — zod on **tool inputs and LLM routing plans only** (never API responses). Tightest
bounds in finance: `limit: z.number().int().positive().max(100)`, `read_filings.limit`
`.int().min(1).max(10)`, and exactly one cross-field `.refine()` (exactly-one-of
ticker/filer_name/filer_cik). Tickers have **no regex**; dates are bare `z.string()`.

**EquiGen** — zod in 6 places: LLM structured output (`ai/schema.ts`,
`langgraph-pipeline.ts:41-320` via `withStructuredOutput`, `parallel-extract.ts:65-100`),
API bodies (`lib/validation/index.ts`, used at `api/report/route.ts:19` with `.safeParse`),
tool input (`python-run-tool.ts`), vision tables (`table-extractor.ts:235` — the only `.parse()`
that throws). **Zero `.refine()` in the entire repo.**

**Both share these gaps:**
- **No zod validation on any external API response** (EquiGen: Yahoo/BSE/NSE/RSS; Dexter:
  Financial Datasets). Both cast and pass through.
- EquiGen leniency: `z.union([z.string(), z.number()]).nullable().optional()` on nearly every
  money field; `AIDetailedFinancialsSchema` is `z.array(z.record(z.union(...)))` — **no
  financial shape at all**.
- EquiGen's SEBI judge output is bare `JSON.parse` (`sebi-compliance-tool.ts:99`).
- **No schema for `ForensicQualityData`, `FinancialEvaluationReport`, `ModelingOutput`, or the
  persisted `reportData` JSON.** `ReportHistory.reportData` is written as
  `JSON.parse(JSON.stringify(...)) as Prisma.InputJsonValue` with no runtime check.

**Remediation**

1. Add `YahooQuoteSchema`, `BseScripHeaderSchema`, `BsePeercompSchema`, `BseShareholdingSchema`,
   `NseApiSchema`, `GoogleNewsRssSchema` and `safeParse` every external response —
   `if (!parsed.success) throw new DataSourceContractError('bse', issues)`. This is Dexter's
   biggest correctness miss; fixing it beats anything else on the data side.
2. Tighten `AIDetailedFinancialsSchema` from `record(union)` to a real statement shape.
3. `z.object(...).parse()` the SEBI judge output (as Dexter does with
   `JudgeOutputSchema` + `withStructuredOutput`).
4. Add `.superRefine()` cross-field rules: `rating`↔`upsidePct` coherence,
   `targetPrice > 0`, `period` monotonic, `sharesOutstanding > 0`,
   `totalAssets ≈ totalLiabilities + equity`.
5. Add a zod schema for persisted `reportData`; validate on write **and** on read (this also
   fixes the unused `contentHash` — see GAP-18.8).

---

## 4. Shared Weaknesses — Neither Project Solves These

Address these and EquiGen leads the category.

1. **No claim→source citation rendering in output.** Dexter attaches `sourceUrls` to tool
   results; EquiGen attaches static labels. Neither requires or renders per-claim provenance.
   EquiGen has the raw material (accession numbers, `DocumentPage.pageNo`) and a unique
   opportunity (Indian filings are attachment-PDF-based with page numbers).
2. **No per-datum provenance type.** See GAP-08. This is the structural root cause of 1, and of
   most of GAP-09.
3. **No narrative golden-regression.** Dexter has zero snapshots; EquiGen has zero. Nothing
   detects drift in report prose/structure over time.
4. **No LLM-judge benchmark against human reference notes at scale.** Dexter's 50 questions
   include `expertTimeMinutes` (a human baseline) but doesn't score against human-written
   reference notes as a *quality ceiling*.
5. **No detection of the rounding/abbreviation failure mode.** Dexter's `fmtNum(toFixed(1))` is
   the canonical example; neither project guards it.
6. **No cross-source reconciliation of the same metric** (e.g. BSE `DefaultData` revenue vs
   Yahoo revenue vs the PDF's audited revenue). For Indian markets this is tractable and would
   be a genuine differentiator.
7. **No drift monitor on upstream data contracts.** If BSE changes
   `ShareHoldingPatternNew`'s shape, both fail silently (EquiGen worse: `catch { return [] }`).

---

## 5. Prioritised Roadmap

Effort in engineer-days. Ordered by risk reduction per unit effort.

### P0 — Trust blockers (must ship before real institutional users)

| # | Item | Gap | Effort |
|---|---|---|---|
| P0-1 | **Enforce `FinancialEvaluationEngine` verdicts.** `FAILED_UNRELIABLE` → `pending_review`; block download/export with 409 + justified override; kill the autonomous `published` shortcut. | GAP-19.1/2 | 3 |
| P0-2 | **Fix the PDF provenance badges** to be conditional on `dataSources` + verdict; real `asOf`; add a `dataQuality` watermark. | GAP-19.6 | 2 |
| P0-3 | **Delete/lock the synthetic generators.** `generateDynamicFinancialModel`, `generateSyntheticHistory`, the hardcoded `steer` payloads, `isSyntheticModel`. Fix `/api/download` auth ordering. | GAP-19.3/4/5/7 | 2 |
| P0-4 | **Close the cross-tenant leaks.** One `requireOrgSession`; remove `default-org` super-tenant; delete the `equigen-internal` literal; fix the role-case mismatch; add the tenancy test matrix. | GAP-18 | 4 |
| P0-5 | **Refuse to display forensic values derived from missing inputs.** Implement real Altman/Beneish inputs or relabel as proxies; `auditorQuality: "Not assessed"`; make `workingCapitalCycleDays` real or `null`-labelled. | GAP-19.8/9 | 4 |
| P0-6 | ~~**Make the existing checks binding**~~ **DONE.** All sections checked against real financials; bounded regenerate; `pipelineEval` awaited + persisted; `ComplianceAgent` verdict enforced (fail-closed). Also fixed a real ordering bug where the compliance audit flagged the disclosures it had not yet appended. | GAP-05.1/2, GAP-09 | 3 |
| P0-7 | **Stop falsifying freshness/liveness.** Remove `?? new Date()`; `AUTH_02` FAILs on absent `fetchedAt`; fix `api/eval/run`'s non-null inference. | GAP-07.3 | 1 |
| P0-8 | ~~**Collapse to one DCF engine**~~ **DONE.** Single TS engine; net-cash carried through; guards throw instead of emitting ₹1/Infinity; sensitivity grid and Monte Carlo now call the same engine. Also: real WACC (CoE + rating-spread Kd + weights), seeded RNG, and two fabrications removed from the report renderer. | GAP-16.1–4 | 3 |
| P0-9 | **Fix BSE FY aggregation** (quarters→FY, EPS sum not max) and the `TTM` mislabel. | GAP-17 | 2 |
| P0-10 | **Fix ₹ mojibake**; add a `\uFFFD` assertion to every output test. | GAP-17 | 0.5 |
| **P0-11** | ~~**Stop fabricating peers, metrics, history and ratings in the renderer**~~ **DONE.** `html-report-generator.ts` fabricated peer tables, a five-year history, six subject metrics, the reference price and the rating. All now null-render as `n/a` with explicit unavailability statements. See remediation log. | GAP-17 addendum | 1.5 |

**P0 subtotal ≈ 26.5 engineer-days.**

### P1 — Quality measurement & verification depth

| # | Item | Gap | Effort |
|---|---|---|---|
| P1-1 | **Build the rubric eval harness** — 50+ question CSV, fail-closed rubric parser, contradiction→0 scoring, seeded sampling, dataset hash, LLM-judge with zod output, `EvalRun` tables, score-trend API. | GAP-01 | 8 |
| P1-2 | **Raise test coverage** — thresholds 75/75/65, scope `src/lib` + `src/app/api` + `src/components`; add `forensic-accounting-tool`, `state-machine` quality gate, sandbox blocklist adversarial corpus, `html-report-generator` golden HTML, `ticker-resolver`. | GAP-02 | 8 |
| P1-3 | **Introduce `SourcedDatum`** — provenance on every reported figure; render source chips in UI + PDF; populate `ReportSection.citations` from real refs; measure `citation_density`. | GAP-08 | 8 |
| P1-4 | **Add CI** (`typecheck` + `vitest` + `eval:regression` w/ committed baseline); fix `run-eval.ts`; add `pnpm eval` scripts. | GAP-01.8, GAP-02.10 | 2 |
| P1-5 | **Extend `ConsistencyCheckerTool`** from 3 fields to the full metric set; add ticker-allowlist validation. | GAP-09.1/4 | 4 |
| P1-6 | **Error taxonomy + `_errors` propagation** — `classifyError`, `NonRetryableError`, `DataSourceResult<T>` replacing `catch { return null }`, `auditStatus` distinct from `null`, awaited report persistence. | GAP-03 | 5 |
| P1-7 | **Port Dexter's DCF Step-7 gates** into the eval engine: TV/EV 50–80%, EV within 30% of market, FCF/share × 15–25×, WACC < ROIC. | GAP-05.3 | 2 |

**P1 subtotal ≈ 37 engineer-days.**

### P2 — Durability, architecture & scale

| # | Item | Gap | Effort |
|---|---|---|---|
| P2-1 | **Persist trajectory + sections** to Postgres; SSE replay from DB; works across instances/restarts. | GAP-14 | 3 |
| P2-2 | **Cache layer with named TTLs** tuned to IST trading sessions, structural validation, self-healing delete, BSE pagination + `isTruncated`. | GAP-07 | 4 |
| P2-3 | **Context ladder** — memory flush → numeric-preserving LLM compaction → truncate; tool-result budget (50K/200K). | GAP-04.1–3 | 4 |
| P2-4 | **Long-term agent memory** — persist `AgentMemory`, hybrid retrieval (0.7 vector + 0.3 keyword + decay + MMR) ported from Dexter. | GAP-04.4 | 6 |
| P2-5 | **Extract prompts to `src/lib/ai/prompts/*.md`** with `promptVersion` (wiring the existing `ChunkExtraction.inputHash` invalidation); methodology skills. | GAP-10 | 5 |
| P2-6 | **Reflexion**: reflect milestone + DAG scheduler honouring `dependsOn`; subagent registry with tool allowlists returning tool records. | GAP-05, GAP-06 | 8 |
| P2-7 | **External-response zod contracts** for Yahoo/BSE/NSE/RSS + tighten `AIDetailedFinancialsSchema` + zod the SEBI judge. | GAP-20 | 4 |
| P2-8 | **Seeded Monte Carlo** + persisted manifests; bull/bear from p90/p10; real India WACC (10Y G-Sec + rating-derived cost of debt + target D/E). | GAP-16.5/6 | 4 |
| P2-9 | **Unified provider registry + one ladder + fast/slow models + prompt caching**; include OpenRouter in budget accounting. | GAP-12 | 3 |
| P2-10 | **Securities master** — single ticker→scrip/NSE/sector/ISIN map; verified exchange resolution. | GAP-17 | 2 |
| P2-11 | **Slot-based report template** (replacing the 120 KB generator monolith) enabling golden-file tests + org white-label. | GAP-10.3 | 6 |
| P2-12 | **Plan-level cost ceiling** enforced (currently estimated only); per-subagent budgets. | GAP-06 | 2 |
| P2-13 | **URL allowlist + SSRF guard** on Puppeteer; tool permission tiers. | GAP-11 | 2 |
| P2-14 | **Scheduled coverage / digests** (cron-equivalent on the existing queue worker). | GAP-13 | 3 |
| P2-15 | **Data-source health page** — which sources are live/stale right now (promote `_errors` to UI). | GAP-13.3 | 2 |

**P2 subtotal ≈ 58 engineer-days.**

### P3 — Polish / completeness

P3-1 Shared weaknesses (§4): cross-source metric reconciliation, narrative golden-regression,
upstream contract drift monitor. P3-2 Report export as HTML template + per-firm themes.
P3-3 Keyboard/shortcut parity (Dexter's ⌘K, `/`-commands). P3-4 Prompt-input budgets and
`compactDescription`. P3-5 Multi-judge consensus with inter-rater agreement in evals.

---

## 6. Acceptance Criteria

A "reliable for real users" bar that is measurable:

| Metric | Current | Target |
|---|---|---|
| A report with `FAILED_UNRELIABLE` that can be downloaded/exported | **yes** | **no** |
| Reported figures carrying source + `asOf` | 0% | 100% |
| PDF provenance badges shown when data is fallback | **yes** | **no** |
| `src/lib` line coverage | ~60% (threshold) | ≥75% |
| `forensic-accounting-tool` test coverage | **0%** | ≥90% |
| Tests for the sandbox blocklist | **0** | ≥20 cases |
| Cross-tenant tests across org-scoped routes | **1 route** | **all routes** |
| Eval questions with atomic rubrics | 0 | ≥50 |
| Contradiction → hard-zero scoring | **absent** | present |
| Eval scores persisted with a baseline + trend | **no** | yes |
| Eval runs in CI | **no CI at all** | yes |
| Monte Carlo reproducible from a persisted seed | **no** | yes |
| Distinct DCF engines | **2** | **1** |
| Silent `catch {}` in `src/lib/` | ~12 | ≤2 |
| Dead/orphaned tools | 2 (`screener-scrape-tool`, `python-run-tool`) + `isSyntheticModel` | 0 |
| Prompt files under version control | 0 | ≥12 with `promptVersion` |
| Trajectory survives a restart | **no** | yes |
| Cross-tenant auth helper count | 3 inconsistent patterns | 1 |

---

## 7. Recommended Sequencing

```
Week 1–2   P0-1..P0-3   Enforce existing verdicts; fix PDF badges; kill synthetic paths
Week 2–3   P0-4..P0-7   Tenancy + auth consolidation; make checks binding; stop falsifying
                         freshness; one DCF engine
Week 3–4   P0-8..P0-10  Valuation correctness; BSE FY; ₹ mojibake
           ── P0 complete: nothing unverifiable can reach a user ──
Week 4–5   P0-5         Forensic honesty (real inputs or honest "not assessed")
Week 5–9   P1-1..P1-4   Rubric eval harness; coverage raise; SourcedDatum; CI
Week 9–14  P1-5..P1-7   Full numeric reconciler; error taxonomy; DCF Step-7 gates
           ── P1 complete: quality is measured and regression-tracked ──
Week 15+   P2           Durability, memory, prompt extraction, reflexion, skills
```

**North star:** EquiGen already has the *financial engineering* Dexter lacks. Dexter has the
*engineering discipline* EquiGen lacks — evals that can fail, tests that probe, errors that
surface. P0+P1 is roughly 62 engineer-days to combine them, after which EquiGen would be
**strictly ahead of Dexter** on the axis that matters for an institutional product: you could
point at any number in any report and show exactly where it came from.

---

## Appendix 0 — Remediation Log

### DONE — Branding: removed all third-party house-style references (own brand system)

The repo previously referenced **Geojit** (a real, competing SEBI-registered research firm) as its
report design target in 13 places, including an LLM system prompt instructing the model to imitate
that firm's publication style. That is a trademark/exposure risk and, more importantly, it
undercuts white-label multi-tenancy. All references are now EquiGen's own house system.

| Change | Detail |
|---|---|
| **New `src/lib/brand.ts`** | Single source of truth for every user-facing brand string, colour token and legal-disclaimer default: `BRAND`, `BRAND_COLORS`, `SEBI_RISK_WARNING`, `draftWatermark()`, `resolveFirmIdentity()`. |
| `src/lib/templates/index.ts` | `GEOJIT_THEME` → `EQUIGEN_THEME`; `GeojitTheme` → `EquiGenTheme`; palette re-tokenised to EquiGen's own navy/teal/amber. |
| `src/lib/ai/langgraph-pipeline.ts:479` | System prompt no longer says *"Write in the house style of Geojit's … reports"*. Now describes EquiGen's own four-page initiation-note structure. |
| `src/lib/ai/html-report-generator.ts` | Firm name, compliance email and website now resolve per-export via `resolveFirmIdentity()` instead of hardcoded `EquiGen Investments Limited` / `www.EquiGen.com`. `SEBI_RISK_WARNING` and `draftWatermark()` are shared constants. Colours read from `BRAND_COLORS`. |
| `src/lib/excel/excel-generator.ts` | Workbook creator/descriptors read from `BRAND`. **Removed the fabricated fallback SEBI registration `INH000001234`** from the attestation sheet — an invented INH id is a false regulatory credential. Now renders `SEBI Reg. No. NOT SUPPLIED`. |
| `src/lib/pdf/index.ts` | `ReportPDFMetadata` type now carries `orgName` / `complianceEmail` / `website`. |
| `src/app/api/download/route.ts`, `src/app/api/excel/export/route.ts` | Load the tenant `Organization` and pass `orgName` into every export. Excel filename now uses the tenant firm name. |
| `src/app/layout.tsx`, `src/lib/billing/plans.ts`, `src/app/api/report/route.ts` | Marketing copy and doc comments de-branded. |
| `src/types/index.ts`, `src/lib/validation/index.ts`, `src/lib/ai/schema.ts`, `src/lib/ai/langchain-service.ts`, `src/lib/ai/institutional-equity-data.ts`, `plan.md` | Comments de-branded. |

**Behavioural improvement, not just cosmetics:** `resolveFirmIdentity()` returns
`isUnconfigured: true` and renders an explicit `[Firm identity not configured]` marker when a tenant
has not set its publishing identity, instead of asserting *"EquiGen Investments Limited is a SEBI
registered Research Entity"* in a compliance certification. Verified end-to-end: rendering with
`orgName: "Meridian Capital Advisors LLP"` produces zero Geojit references, zero
`EquiGen Investments Limited`, zero `www.equigen.com`, zero `INH000001234`.

### CORRECTION — the "₹ mojibake" finding (P0-10) was a false positive
A full byte-level scan of `src/**/*.{ts,tsx}` for `U+FFFD` returns **0 occurrences**. The `�`
observed in `html-report-generator.ts`, `api/eval/route.ts` and `ScenarioModeler.tsx` is a **Windows
console rendering artifact** — the underlying characters are correct (`U+00B7` middle dot,
`U+2014` em dash, `U+20B9` rupee). **P0-10 is not a source defect.**

The *non*-mojibake part of that finding stands and is worth doing: add a
`expect(output).not.toContain("\uFFFD")` assertion to PDF/HTML/Excel golden tests, because
`src/lib/parsers/math-sumprecise-polyfill.ts:9-11` documents that ₹/±/× glyphs genuinely do
degrade in extracted financial PDFs — the guard belongs at the parser/output boundary, not in
static source.

### DONE — P0-5 Forensic honesty (commit f78869a follow-up, `fix(forensic)`)

The forensic panel was the most misleading surface in the product. Every defect
below was **silent**: the panel rendered normal-looking, authoritative values.

**Defect — absence of evidence produced the best possible score.**
`forensic-accounting-tool.ts:252` computed `healthScore = 100 - scoreDeductions`.
With no inputs, nothing could be deducted, so a company the system had never
heard of scored **100/100 LOW risk**. Now a `coverage` object tracks what was and
was not assessed; an empty coverage forces `riskLevel: "NOT ASSESSED"`, adds a
60-point deduction, and pushes a red flag saying explicitly that this is an absence
of data, not a clean bill of health.

**Defect — the accrual check returned a PASSING score when it had no data.**
`beneishMScore` set `score = -2.35, status = "safe"` in the missing-input branch.
A company with no cash flow data was reported as a non-manipulator. Now `null` +
`not_assessed`, with `methodology: "single_factor_accrual_indicator"` and
`isBeneishMScore: false` so no consumer can mistake it for the 8-variable model.

**Defect — two of the five Altman factors were invented.**
`x1` defaulted to `0.15`, `x2` to `0.4`, `x4` to `4.5`/`1.2`, and total assets to
`bookValue*0.4 + debt*1.2` with a `500` Cr fallback. The result was presented
against published Altman zone thresholds. The factor form now requires **all five
factors disclosed**; otherwise it reports `not_assessed` and lists the missing
items by name.

**Defect — the solvency check could never run, and nobody knew.**
`forensic-agent.ts:71-74` built the company's entire working-capital position from
`totalDebt * 0.8` and `* 0.8 * currentRatio`. `receivablesCr` was never populated,
so `forensic-accounting-tool.ts:199` could never fire and always reported "in line".
The agent now passes through only disclosed lines (new
`ExtractedFinancials.balanceSheetLines`, parsed from Yahoo's
`balanceSheetHistory`); anything absent stays `null`.

**Defect — every company was reported as audited-clean.**
`auditorQuality` defaulted to `"Clean"` because `auditorQualificationText` was
never populated. Now `"Not Assessed"` when no report text is available, and the
UI renders it in muted italic rather than as a verdict.

**Defect — `promoterPledgePct ?? 0` equated "not retrieved" with "unencumbered".**
Now `null`, and the UI shows `NOT DISCUMBERED`→`NOT DISCLOSED` / `—`.

**Defect — the zone gradient was shown with no score behind it.** Withheld when
`altmanZScore.score` is null.

**Defect — the "SEBI Standard" pill on the card overstated the methodology.** The
pill is retained (the thresholds are institutional conventions) but each pillar is
now labelled for what it actually is: "Balance Sheet Solvency (Z-form)" and
"Accrual Quality (Single-Factor)".

**`Architecture.md:238` claimed the "Beneish M-Score 8-variable model".** Corrected
to state plainly what is computed and what the full model would need.

**Tests: +38 (227 → 265).** `forensic-accounting-tool.test.ts` is new — the engine
previously had **zero** coverage. It pins every behaviour above, including the
specific old values (`-2.35`, `Clean`, `100/100`) so they cannot silently return.

Two real bugs were found and fixed *by these tests*:
1. `istTradingDate` threw on an unparseable timestamp (invalid date → `toISOString`
   throws), which would have crashed the whole audit. Both it and the audit call
   site are now guarded.
2. The auditor-opinion classifier tested `/qualified/` **before** `/unqualified/`,
   so "Unqualified opinion: true and fair view" was classified as **Qualified** —
   a clean opinion reported as a qualification. Reordered with a word boundary.

### DONE — P0-6 Making the checks binding (`fix(consistency)`)

Three verification stages existed, ran every time, cost real latency — and changed
nothing. Each was computed and then discarded before the report was written.

**Defect — the consistency checker only read one of six sections.**
`ConsistencyCheckerTool` was called with the executive summary alone. A report
could state a target price in `valuation` that bore no relation to the model and no
one would ever compare them. It now runs `checkAllSections` over every section and
probes nine fields (target price, WACC, terminal growth, revenue, EBITDA, PAT, EBITDA
margin, net debt, shares outstanding) against the model output and the extracted
financials.

**Defect — the rating-vs-upside check could never fire.**
The synthesis agent passed `undefined` as the extracted financials, so
`currentPrice` was always missing and the comparison was always skipped. The
orchestrator now resolves `effectiveFin` once and threads it through. A `SELL`
against a modelled upside above 15% (or `BUY` against a modelled downside) is now
caught.

**Defect — the result was written to the DB and then ignored.**
`consistencyCheck` was persisted on `SynthesisOutput` and read by nothing.
Contradictions were regenerated at most twice and then logged to a console line; the
report shipped anyway. The verdict is now persisted on the report payload and
enforced by `forcedStatusForAudit` and the distribution gate.

**Defect — `pipelineEval` was fire-and-forget.**
`pipelineEval.run(...).catch(console.warn)` — the score was never stored, never
returned, and never gated anything. It is now awaited, its verdict persisted under
`reportData.pipelineEval`, and a `FAIL` verdict (or sector-fallback data) is logged
as a reason the report is held.

**Defect — `ComplianceAgent` ran to completion and was thrown away.**
`complianceOutput` was assigned and never read; only `updatedSections` was used.
`readIntegritySummary` now reads both the compliance audit and the consistency
result, and blocks on: a critical SEBI violation, `isCompliant !== true`, an
unreadable result, an unresolved high-severity contradiction, **or the absence of
either check entirely** — consistent with the fail-closed rule already applied to
the authenticity audit. "We could not check it" must never read as "it is fine".

**Real bug found while binding the compliance gate — the audit flagged its own
disclosures.** `ComplianceAgent` ran `auditReportAsync` on the section text *before*
appending the statutory disclosures. The SEBI registration number and the
conflict-of-interest statement live in those disclosures, and the rule-based audit
raises a **critical** violation when either is missing — so every run returned
`isCompliant: false`. Harmless while the verdict was discarded; with the verdict
enforced it would have blocked every report from ever being approved. Disclosures are
now appended before the audit runs, and the audit judges the document as it will
actually ship.

---

### DONE — P0-8 One DCF engine, and numbers that cannot silently be wrong (`fix(dcf)`)

Every defect below produced a confident, plausible-looking number rather than an
error, which is why none of them surfaced in review.

**Defect — the displayed sensitivity matrix described a different company.**
`computeDCFValuation` re-derived FCFF inline for the grid as
`revenue x margin x 0.85 x (1 - tax) - revenue x capex`, ignoring the DSO/DIO/DPO
working-capital schedule and the capex/depreciation build that the headline
valuation used. Measured on identical inputs: **centre cell 1502.34 against a
headline target price of 1819.81** — a 17% discrepancy inside one table. Every cell
now re-runs the same 3-statement engine with the stressed WACC and terminal growth.

**Defect — `wacc <= terminalGrowth` produced a negative enterprise value.**
The Gordon Growth terminal value divides by `(wacc - terminalGrowth)`. With
`wacc 4% / g 5%` the engine returned **enterpriseValue −1,135,220**, which
`Math.max(1, ...)` then reported as a confident **₹1 target price**. `runThreeStatementModel`
now validates its drivers up front and throws `InvalidValuationInputError`, listing
every problem rather than the first. No placeholder price is ever returned.

**Defect — a zero share count produced a target price of `Infinity`.**
`sharesOutstandingCr: 0` divided equity value by zero; `Math.max(1, NaN)` did not
catch it. Shares are validated as positive, and `ModelingAgent` no longer substitutes
a fabricated 50 Cr share count when the real figure is unknown — it leaves it at 0 so
the valuation is refused and the reason is reported.

**Defect — net cash was thrown away.**
`buildParamsFromFinancials` computed `netDebt = Math.max(0, debt - cash)`, discarding
the cash pile for every net-cash company (IT majors typically hold more cash than
debt) and valuing them as though they had neither. Net debt is now carried through,
including its negative sign, and increases equity value accordingly.

**Correction to the original finding — net debt was NOT double-subtracted.**
The analysis claimed `equityValue = EV − netDebt` was computed twice. Measured, the
engine's internal value and the wrapper's recomputation are **identical**: the engine
derives `netDebt = baseDebt − baseCash` from the same figure, so subtracting it twice
from the same base is idempotent. `equityValueCr === enterpriseValueCr − netDebt`
holds exactly. The wrapper was reading a value the engine had already computed, so it
now reads `modelResult.equityValue` — a de-duplication, not a fix. Recorded here
because a test now pins the single-subtraction property.

**Defect — the reported valuation depended on whether Python was installed.**
`ModelingAgent` preferred the Python sandbox output whenever Python ran and used the
TypeScript engine only when it failed. The two engines disagreed: the Python path used
`ebitda * 0.85 * (1 - tax) - revenue * capex` for FCFF, and derived bull/bear from fixed
`x1.25 / x0.78` multipliers against the engine's Monte Carlo percentiles. Which
"the" valuation was published therefore depended on the host environment. The
TypeScript engine is now the single source of truth; the sandbox still runs so the
generated script and inputs stay auditable, but its numbers are never presented.

**Defect — cost of equity was labelled WACC.**
`wacc = rf + beta x erp` is the CAPM **cost of equity**; it omitted the cost of debt
and the capital-structure weights entirely, so the "WACC" was 12.5% for every company
regardless of leverage. Now built properly:

    Ke  = rf + beta x ERP                    (cost of equity)
    Kd  = rf + rating-based credit spread     (pre-tax cost of debt)
    WACC = Ke x E/(D+E) + Kd x (1-t) x D/(D+E)

The credit spread is graded from the actual rating where one exists, with a documented
spread for unrated issuers rather than an implicit AAA. `rf` remains a static India 10Y
assumption, not a live G-Sec fetch — stated in the report's own `waccDerivation` field.

**Defect — no valuation could be reproduced.**
Monte Carlo used `Math.random()`, and its percentiles were read at hardcoded indices
(`mcSims[100]`, `mcSims[500]`, `mcSims[900]`) that only happened to be p10/median/p90
for exactly 1,000 sorted samples. Replaced with a seeded mulberry32 PRNG and true
quantile indexing; the seed is returned on the result so a run can be re-derived.

**Fabrications removed from the report renderer.**
`html-report-generator.ts` invented, rather than omitted:
- a full 5x5 sensitivity grid scaled off the headline price
  (`target x (baseSpread / spread)`, and `target x 1.4` whenever the spread fell
  below 1% — a 40% uplift implying a valuation that was never performed);
- bull and bear cases of `target x 1.18` and `target x 0.82` when the model produced
  none.
It now renders only what the engine computed, and states that sensitivity analysis is
unavailable otherwise. Cells where WACC <= terminal growth render `n/a` rather than a
price, in HTML, Excel and the scenario modeller.

**New finding, NOT fixed here (see GAP-17 addendum).**
The same function fabricates **peer companies** — literal tickers `PEER1`/`PEER2`
named "Sector Peer A"/"Sector Peer B", with multiples derived as `cmp x 0.92`,
`pe x 0.85`, `roe: 14.5` — and a `marketCapCr = 250000` default. Inventing named
comparables in an institutional research report is a more serious defect than any of
the above and is tracked separately.

**Tests: 335 passing (29 files).** New: 24 for DCF correctness (grid consistency,
monotonicity, the equity bridge, guards, no-fabricated-floor, reproducibility) and 11
for discount-rate derivation. One test written during this work asserted that a more
geared company must have a *higher* WACC; that is backwards, and the corrected test
pins the real relationship (leverage lowers WACC when after-tax Kd < Ke).

---

### DONE — P0-11 The renderer was the largest single source of invented numbers (`fix(report-integrity)`)

Found while fixing P0-8. Scope turned out to be far wider than the peer fabrication
first logged: `html-report-generator.ts` invented roughly a dozen figures, several of
which were load-bearing for the report's conclusions.

**Defect — peer tables for real listed companies, gated on a keyword.**
If the report text happened to contain `"SBIN"` or `"HDFCBANK"`, the renderer emitted a
full comparison table for those **real, traded securities** with hardcoded prices and
multiples: SBIN ₹812 / 12.0x P/E / 16.5% ROE / ₹7,24,000 Cr; PNB ₹114; HDFC Bank
₹1,640 / ₹12,50,000 Cr. A reader has no way to distinguish a fabricated price from a
fetched one — both are typeset identically. This is the most serious defect in the
repository: **asserting market data for named listed companies that was never observed.**

**Defect — comparables that do not exist.**
Failing the keyword test, it emitted literal tickers `PEER1`/`PEER2` named "Sector Peer
A"/"Sector Peer B", with multiples back-derived from the subject company
(`cmp x 0.92`, `pe x 0.85`, `pb x 0.82`, `roe: 14.5`).

**Defect — a five-year financial history invented from one revenue figure.**
The fallback branch back-extrapolated FY24/FY25 revenue from base revenue at the assumed
growth rate, invented EBITDA margins as `0.95x / 1.00x / 1.04x / 1.08x / 1.12x` of the
assumed margin, set PAT at a flat 65% of EBITDA, the share count at 500 Cr and EPS at
₹12.5. **FY24 and FY25 carry no "E" suffix, so fabricated extrapolations were labelled as
reported actuals.** Inventing history is a more serious class of defect than inventing a
forecast.

**Defect — six subject metrics defaulted to plausible constants.**
Market cap ₹2,50,000 Cr, P/E 21.5x, P/B 2.85x, ROE 15.8%, ROCE 12.4%, dividend yield
0.85%. FII 44.4% and DII 45.3% were likewise hardcoded, making "promoter holding" an
arithmetic remainder of two invented numbers. A company with no retrieved financials was
presented with a complete, authoritative metrics block.

**Defect — the current price was invented, which manufactured the rating.**
With no price found, CMP was set to `targetPrice / 1.16` — a formula chosen because it
yields ~16% upside. Upside then defaulted to `16.0`, and the **investment rating** was
derived from it, defaulting to `"BUY"`. A report with no market data whatsoever issued a
BUY recommendation with a fabricated reference price. An unpriced company is now
**NOT RATED**, with null CMP and upside.

**Defect — scenario cards stated drivers the model never ran.**
The bear card printed "Growth x 0.75, EBITDA Margin x 0.88, WACC +1.0%, **Term Growth
3.5%**" and the bull card "x 1.22 / x 1.15 / −0.8% / **5.0%**" — the terminal growth rates
were hardcoded literals. The DCF engine derives bull and bear from the 10th and 90th
percentiles of a Monte Carlo simulation, so these cards described scenarios that were
never computed, sitting directly beneath prices that were. Cards now state the price and
its real provenance; driver assumptions print only for the base case.

**All fabrications removed.** Every affected field is nullable and renders `n/a` with an
explicit statement of what is unavailable and why (peer comparables, financial history,
sensitivity analysis, reference price). Charts are omitted rather than plotted against 0,
which would draw a revenue collapse that never happened.

**Tests: 352 passing (30 files).** 17 new tests assert the absence of each fabrication
and the presence of each unavailability statement. One test initially failed on
`not.toContain("Sector Peer")`; the string legitimately survives as a section heading
("Sector Peer Valuation Multiples"), so the assertion was narrowed to the fabricated row
labels "Sector Peer A"/"Sector Peer B".

**Also discovered, not fixed here:** this file contains **36 literal U+FFFD replacement
characters** where `₹`, `•`, `—` and `÷` belong — i.e. the mojibake in P0-10 *is* real in
this file, contradicting the earlier "false positive" finding. Every currency value it
renders is currently a `�`. Tracked as P0-10.

---

### LATENT BUG SPOTTED — `public/temp/reports` may not exist

`src/lib/pdf/index.ts:52` writes the debug HTML to `public/temp/reports/<TICKER>.html` without
`mkdir -p`, and the failure is swallowed by `catch { /* non-fatal */ }`. In this checkout the
directory is absent, so **every PDF compile silently loses its HTML debug artifact.** Fix: create
the directory before writing, and log a warning on failure rather than discarding it.

---

## Appendix A — File Reference
**Dexter** (`D:\13.current-startups\3.Dexter\dexter`)

| Concern | Path |
|---|---|
| Provider registry | `src/providers.ts` |
| Agent loop | `src/agent/agent.ts` (703 L) |
| Compaction | `src/agent/compact.ts`, `microcompact.ts`, `tokens.ts` |
| Run scratchpad (JSONL) | `src/agent/scratchpad.ts` |
| Tool budget / advisory | `src/agent/scratchpad.ts:51-53`, `src/agent/tool-executor.ts` |
| Eval harness | `src/evals/{run,evaluator,dataset,sampling,options}.ts` |
| Eval dataset | `src/evals/dataset/finance_agent.csv` |
| Skills | `src/skills/{dcf,write-memo,x-research}/SKILL.md` |
| Memory RAG | `src/memory/{search,database,mmr,temporal-decay,chunker,indexer}.ts` |
| Permissions | `src/permissions/{engine,rules,command-parser,read-only}.ts` |
| Finance API + cache | `src/tools/finance/api.ts`, `src/utils/cache.ts` |
| TTL policy | `src/tools/finance/utils.ts:10-14`, `stock-price.ts:62-66` |
| Allowlist anti-fabrication | `src/tools/finance/insider_trades.ts:71-93` |
| Partial-failure surfacing | `src/tools/finance/get-financials.ts:189-214` |
| Error taxonomy | `src/utils/errors.ts` |
| Prompt discipline | `src/skills/write-memo/memo-style.md:34-39`, `src/skills/dcf/SKILL.md` |
| Cron / gateway / CLI | `src/cron/`, `src/gateway/`, `src/cli.ts` |

**EquiGen** (`D:\13.my-startups\EquiGen`)

| Concern | Path |
|---|---|
| Swarm orchestrator | `src/lib/ai/orchestrator/master-orchestrator.ts` |
| Planner | `src/lib/ai/planner/master-planner.ts` |
| Subagents | `src/lib/ai/subagents/{document,modeling,market-intel,synthesis,compliance,forensic}-agent.ts` |
| LangGraph extraction loop | `src/lib/ai/langgraph-pipeline.ts:962-986` (audit → conditional edge) |
| Chat ReAct loop | `src/lib/ai/agent-orchestrator.ts:299` |
| 3-statement engine | `src/lib/financial-modeling/three-statement-engine.ts` |
| Valuation bands | `src/lib/financial-modeling/valuation-bands-engine.ts` |
| DCF / Monte Carlo | `src/lib/sandbox/python-executor.ts:222-381` |
| Authenticity engine | `src/lib/eval/financial-eval-engine.ts` |
| Pipeline eval | `src/lib/eval/pipeline-eval.ts` |
| Eval service | `src/lib/eval/eval-service.ts` |
| Consistency checker | `src/lib/ai/tools/consistency-checker-tool.ts` |
| Forensic engine | `src/lib/ai/tools/forensic-accounting-tool.ts` |
| Quality gates | `src/lib/queue/worker.ts:68-98`, `src/lib/report/state-machine.ts:28-53` |
| PDF generator | `src/lib/ai/html-report-generator.ts` (120 KB) |
| Data tools | `src/lib/ai/tools/{yahoo-financials,bse-financial-data,bse-filings,nse-filings,concall-transcript,credit-rating,sector-news-deep,peer-comparison,ticker-resolver}-tool.ts` |
| Indian number parsing | `src/lib/parsers/table-extractor.ts:73-100` |
| Model routing / budget | `src/lib/ai/{model-router,rate-limiter,retry-wrapper,loop-safety}.ts`, `src/lib/ai/budget/*` |
| Trajectory | `src/lib/ai/trajectory-emitter.ts` |
| Auth / tenancy | `src/middleware.ts`, `src/lib/utils/auth.ts` |
| Schema | `prisma/schema.prisma` (25 models) |
| Tests | `tests/unit/**` (21 files, 87 cases), `tests/e2e/**` |