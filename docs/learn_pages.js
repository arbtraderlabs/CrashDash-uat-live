/* Learn content adapted from the supplied CrashDash Learn Pack.
 * Pure renderers using the canonical shell's typography and cards.
 */

export const LEARN_RESOURCES = Object.freeze([
  ["About", "https://www.crashdash.ai/about.html"],
  ["Strategy Guide", "https://www.crashdash.ai/strategy-guide.html"],
  ["FAQ", "https://www.crashdash.ai/faq.html"],
  ["Roadmap", "https://www.crashdash.ai/roadmap.html"],
  ["Follow on X", "https://x.com/CrashDashAI"],
]);

export function renderLearnResources() {
  return LEARN_RESOURCES.map(([label, href]) =>
    `<a class="nav-link" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
  ).join("");
}

export function renderHowToUseCrashDash() {
  return `<section class="view-learn" aria-labelledby="guide-heading">
    <div class="view-heading"><p class="eyebrow">Learn</p><h1 id="guide-heading">How to Use CrashDash</h1></div>
    <div class="customer-section"><h2>Signal first. Evidence second. Conviction third.</h2>
      <p class="context-note">CrashDash narrows the research universe. A Research Alert is a prompt to investigate, not an instruction to buy or sell. You make the investment decision.</p></div>
    <div class="customer-section"><h2>A practical research walkthrough</h2>
      <ol class="reason-list">
        <li><strong>Start with Today.</strong> Review the morning briefing for new or recently noteworthy signals. <a href="?view=today">Open Today</a>.</li>
        <li><strong>Open Research Alerts.</strong> Use Crash Severity, recency and the accumulation overlay to prioritise what deserves attention. <a href="?view=current">Open Research Alerts</a>.</li>
        <li><strong>Choose one company.</strong> Start with company context and the Beginner view. Switch to Pro when you want the underlying evidence categories and deeper detail.</li>
        <li><strong>Understand severity.</strong> Read the observed condition using the four tiers below. Greater severity does not imply a better opportunity or a recovery.</li>
        <li><strong>Examine price and Relative Activity.</strong> Review the price history, alert date and trading activity. Check units, availability and data-quality notes before comparing values.</li>
        <li><strong>Inspect the evidence.</strong> Separate observed facts from interpretation. Missing evidence is unavailable, not a reason to infer an answer.</li>
        <li><strong>Review company and RNS context.</strong> Read official updates and the available research context alongside the signal.</li>
        <li><strong>Review signal and history context.</strong> Where available, inspect previous alerts and the Signal Timeline. Historical observations describe what happened; they do not forecast what comes next.</li>
        <li><strong>Continue your own research.</strong> Check the business, financing, liquidity and risks. Continue researching, monitor the company, or pass.</li>
        <li><strong>You decide.</strong> CrashDash helps identify what deserves a second look. Human research and judgement remain required.</li>
      </ol></div>
    <div class="customer-section"><h2>Crash Severity: four evidence-led tiers</h2>
      <ul class="reason-list">
        <li><strong>Close Watch</strong> — an early, contained crash-style condition.</li>
        <li><strong>Elevated</strong> — a deeper crash-style condition than Close Watch.</li>
        <li><strong>High</strong> — an extreme crash-style condition.</li>
        <li><strong>Extreme Caution</strong> — the most severe crash-style condition CrashDash records.</li>
      </ul>
      <p class="context-note">These labels describe observed conditions, not expected returns.</p></div>
    <div class="customer-section"><h2>Accumulation is a separate overlay</h2>
      <p class="context-note">The purple Accumulation Pattern overlay describes unusual buying-side activity alongside a signal. It is not a fifth severity tier, proof of institutional or insider buying, or confirmation of a reversal.</p></div>
    <div class="customer-section"><h2>Before you move on</h2>
      <p class="context-note">Read <a href="?view=expect">What to Expect</a> for the current product boundaries, or return to <a href="?view=learn">Understanding CrashDash</a>.</p></div>
  </section>`;
}

export function renderWhatToExpectCrashDash() {
  return `<section class="view-learn" aria-labelledby="expect-heading">
    <div class="view-heading"><p class="eyebrow">Learn</p><h1 id="expect-heading">What to Expect</h1></div>
    <div class="customer-section"><h2>Selective signals, deliberate research</h2>
      <p class="context-note">CrashDash looks for overlooked, severely dislocated situations that may deserve further research. Signals are selective and are not expected constantly. Some sessions will be quiet; that is expected.</p></div>
    <div class="customer-section"><h2>A UK-focused proof of concept</h2>
      <p class="context-note">The current POC focuses on LSE / AIM / AQUIS. Broader markets, production hardening, licensed data and formal quant validation belong to the roadmap, not the current claim.</p></div>
    <div class="customer-section"><h2>Evidence may be incomplete</h2>
      <p class="context-note">Public and low-cost data and bounded web sources can be partial, delayed or unavailable. Read the visible limitations. Missing evidence should remain explicitly unavailable rather than guessed.</p></div>
    <div class="customer-section"><h2>Deterministic signals, bounded AI context</h2>
      <p class="context-note">Signal membership is deterministic. AI provides bounded explanation and context where available; it does not decide whether a company qualifies for a signal. An explanation does not replace verification of the evidence.</p></div>
    <div class="customer-section"><h2>Severe does not mean attractive</h2>
      <p class="context-note">A dramatic fall can reflect a broken business, financing stress, illiquidity, a corporate action, bad data or genuine capitulation. Crash Severity describes the observed condition. Accumulation remains separate context, not a promise of recovery.</p></div>
    <div class="customer-section"><h2>You remain the decision-maker</h2>
      <p class="context-note">CrashDash is a research platform, not an execution system, portfolio manager or buy/sell recommendation engine. Human research and judgement remain required.</p>
      <p class="context-note">Signal first. Evidence second. Conviction third.</p></div>
    <div class="customer-section"><h2>Start researching</h2>
      <p class="context-note">Follow the <a href="?view=guide">How to Use walkthrough</a>, or revisit <a href="?view=learn">Understanding CrashDash</a>.</p></div>
  </section>`;
}
