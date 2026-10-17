/* CrashDash Story Mode: quarter-based company timeline.
 *
 * Ported from the approved Story Mode baseline (source 07701d1b,
 * `product_views.js` quarter machinery) into the MVP preview shell.
 *
 * Every function here is pure: no DOM, no fetch, no clock. The caller supplies
 * the records, the per-ticker official RNS rows and the replay date, so the
 * whole presentation is testable in isolation.
 *
 * Rules that must not be broken:
 *  - Four rolling calendar quarters, oldest first, with real period boundaries.
 *  - An event is positioned by its own date inside its own quarter. Nothing is
 *    moved, stretched or invented to fill a quiet quarter.
 *  - Replay integrity: an event dated after the replay date must never render.
 *  - No future milestone is fabricated. Future periods are not drawn at all.
 */

import { escapeHtml, humanDate, safeExternalUrl } from "./browser.js?v=20261017T145150Z";
import { normaliseEventDate } from "./shell_views.js?v=20261017T145150Z";

export const QUARTER_COUNT = 4;

const QUARTER_MS = 3 * 31 * 24 * 60 * 60 * 1000;

function asUtcDay(value) {
  const iso = normaliseEventDate(value);
  if (!iso) return null;
  const stamp = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(stamp) ? null : stamp;
}

function isoDay(stamp) {
  return new Date(stamp).toISOString().slice(0, 10);
}

function quarterNumber(month) {
  return Math.floor(month / 3) + 1;
}

/* Four rolling calendar quarters. `offset` 0 puts the current quarter last;
 * each increment of `offset` shifts the whole window one quarter earlier.
 * `asOf` anchors the window, so replay never reveals a later period. */
export function quarterWindow(asOf, offset = 0) {
  const anchor = asUtcDay(asOf);
  if (anchor === null) return [];
  const boundary = new Date(anchor);
  const currentQuarterMonth = Math.floor(boundary.getUTCMonth() / 3) * 3;
  const shift = Number.isFinite(offset) ? Math.trunc(offset) : 0;
  const quarters = [];
  for (let index = QUARTER_COUNT - 1; index >= 0; index -= 1) {
    const start = new Date(
      Date.UTC(boundary.getUTCFullYear(), currentQuarterMonth - (index + shift) * 3, 1),
    );
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1));
    quarters.push({
      label: `Q${quarterNumber(start.getUTCMonth())} '${String(start.getUTCFullYear()).slice(-2)}`,
      quarter: quarterNumber(start.getUTCMonth()),
      year: start.getUTCFullYear(),
      start: isoDay(start.getTime()),
      end: isoDay(end.getTime()),
    });
  }
  return quarters;
}

/* True when the window holds no event at all, so the caller can say so plainly
 * instead of rendering four empty columns without explanation. */
export function isEmptyWindow(stories, quarters) {
  if (!quarters.length) return true;
  const first = quarters[0].start;
  const last = quarters[quarters.length - 1].end;
  return !stories.some((story) =>
    story.events.some((event) => event.date >= first && event.date < last),
  );
}

function normaliseRns(ticker, row) {
  const date = normaliseEventDate(row?.published_at) || normaliseEventDate(row?.date);
  if (!date) return null;
  return {
    ticker,
    date,
    kind: "rns",
    title: row.headline || row.title || `${ticker} announcement`,
    detail: row.rating || row.category || "Official announcement",
    href: safeExternalUrl(row.source_url || row.url || row.link),
    reference: row.rns_number ? `RNS ${row.rns_number}` : "RNS",
    time: row.time || null,
  };
}

function signalEvent(record) {
  const date = normaliseEventDate(record.signal_date);
  if (!date) return null;
  return {
    ticker: String(record.ticker || "").trim(),
    date,
    kind: "signal",
    title: record.signal_type || record.watch_severity || "CrashDash signal",
    detail: record.watch_severity || "Severity not recorded",
    href: null,
    reference: record.signal_id || `${record.ticker}:${date}`,
    signalType: record.signal_type || null,
    accumulation: record.accumulation_state || null,
    activity: Number.isFinite(Number(record.relative_activity)) ? Number(record.relative_activity) : null,
    rawColor: record.raw_signal_color || null,
  };
}

/* Build one story per company from the engine's own dated records.
 * `rnsByTicker` maps ticker -> array of official RNS rows. Events newer than
 * `asOf` are dropped, which is what makes replay honest. */
export function buildStories(records, rnsByTicker = {}, asOf) {
  const cutoff = asOf === undefined ? null : normaliseEventDate(asOf);
  const byTicker = new Map();

  const push = (event) => {
    if (!event || !event.ticker) return;
    if (cutoff && event.date > cutoff) return;
    const bucket = byTicker.get(event.ticker) || [];
    bucket.push(event);
    byTicker.set(event.ticker, bucket);
  };

  for (const record of Array.isArray(records) ? records : []) {
    push(signalEvent(record || {}));
  }
  for (const [ticker, rows] of Object.entries(rnsByTicker || {})) {
    for (const row of Array.isArray(rows) ? rows : []) {
      push(normaliseRns(ticker, row));
    }
  }

  const companies = new Map();
  const companyMarket = new Map();
  const companySeverity = new Map();
  const companyAlert = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const ticker = String(record?.ticker || "").trim();
    if (!ticker) continue;
    const date = normaliseEventDate(record.signal_date);
    if (!companies.has(ticker)) {
      companies.set(ticker, record.company_name || ticker);
      if (record.market) companyMarket.set(ticker, record.market);
      if (record.watch_severity) companySeverity.set(ticker, record.watch_severity);
    }
    if (!date) continue;
    const previous = companyAlert.get(ticker);
    if (!previous || date > previous.date) {
      companyAlert.set(ticker, {
        date,
        severity: record.watch_severity || null,
        price: Number.isFinite(Number(record.price_at_signal)) ? Number(record.price_at_signal) : null,
      });
    }
  }

  const stories = [];
  for (const [ticker, events] of byTicker.entries()) {
    const seen = new Set();
    const unique = [];
    for (const event of events) {
      const key = `${event.kind}|${event.date}|${event.reference}|${event.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(event);
    }
    unique.sort((left, right) =>
      left.date === right.date
        ? (left.kind === right.kind ? left.title.localeCompare(right.title) : left.kind.localeCompare(right.kind))
        : left.date.localeCompare(right.date),
    );
    stories.push({
      ticker,
      companyName: companies.get(ticker) || ticker,
      market: companyMarket.get(ticker) || null,
      severity: companySeverity.get(ticker) || null,
      latestAlert: companyAlert.get(ticker) || null,
      events: unique,
      signalCount: unique.filter((event) => event.kind === "signal").length,
      rnsCount: unique.filter((event) => event.kind === "rns").length,
      firstDate: unique[0].date,
      latestDate: unique[unique.length - 1].date,
    });
  }
  return stories.sort(
    (left, right) =>
      right.latestDate.localeCompare(left.latestDate) || left.ticker.localeCompare(right.ticker),
  );
}

/* Percentage position of an event inside its quarter, clamped so a marker on
 * the first or last day of a quarter stays visible inside the column. */
export function positionInQuarter(date, quarter) {
  const day = asUtcDay(date);
  const start = asUtcDay(quarter.start);
  const end = asUtcDay(quarter.end);
  if (day === null || start === null || end === null || end <= start) return null;
  const ratio = (day - start) / (end - start);
  return Math.min(97, Math.max(3, ratio * 100));
}

export function eventsInQuarter(story, quarter) {
  return story.events.filter(
    (event) => event.date >= quarter.start && event.date < quarter.end,
  );
}

function markerTitle(event) {
  const kind = event.kind === "rns" ? "Official RNS" : "CrashDash signal";
  return `${event.date} · ${kind} · ${event.title}`;
}

function severityKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
}

function severityTitle(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function shortDay(iso) {
  const stamp = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(stamp)) return iso;
  const date = new Date(stamp);
  const month = date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${date.getUTCDate()} ${month}`;
}

/* Relative wording is measured against the evidence date, never the wall clock,
 * so a replayed view cannot claim an event is "today" when it is not. */
export function relativeDay(iso, asOf) {
  const day = Date.parse(`${iso}T00:00:00Z`);
  const anchor = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(day) || Number.isNaN(anchor)) return null;
  const days = Math.round((anchor - day) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d since latest";
  return `${days}d since latest`;
}

function priceLabel(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${number.toFixed(4).replace(/\.?0+$/, "")}p`;
}

/* One shared quarter rail, using the approved Focus markup so the MVP renders
 * with the same classes, spacing and colours as the baseline. */
function renderLane(story, quarter) {
  const events = eventsInQuarter(story, quarter);
  const groups = new Map();
  for (const event of events) {
    const left = positionInQuarter(event.date, quarter);
    if (left === null) continue;
    const category = event.kind === "rns" ? "rns" : "signal";
    const bucket = Math.floor(left / 5);
    const key = `${category}:${bucket}`;
    const group = groups.get(key) || { category, positions: [], events: [] };
    group.positions.push(left);
    group.events.push(event);
    groups.set(key, group);
  }
  const dots = [...groups.values()]
    .map((group) => {
      const left = group.positions.reduce((sum, value) => sum + value, 0) / group.positions.length;
      const label = group.category === "rns" ? "Company announcement" : "CrashDash alert";
      const dates = group.events.map((event) => event.date).sort();
      const when = dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]}–${dates[dates.length - 1]}`;
      const detail = `${label} · ${when}${group.events.length > 1 ? ` · ${group.events.length} items` : ""}`;
      const lane = group.category === "rns" ? "calc(50% - 3px)" : "50%";
      return `<span class="mini-story-marker ${group.category === "rns" ? "is-rns" : "is-signal"}${group.events.length > 1 ? " is-cluster" : ""}" style="left:${left.toFixed(2)}%;top:${lane}" title="${escapeHtml(detail)}" aria-hidden="true"></span>`;
    })
    .join("");
  const counts = {
    alerts: events.filter((event) => event.kind === "signal").length,
    rns: events.filter((event) => event.kind === "rns").length,
  };
  const summary = [counts.alerts && `${counts.alerts} alerts`, counts.rns && `${counts.rns} announcements`]
    .filter(Boolean)
    .join(", ") || "no recorded events";
  return `<div class="mini-story-quarter" aria-label="${escapeHtml(`${quarter.label}: ${summary}`)}"><div class="mini-story-quarter-track">${dots}</div></div>`;
}

export function renderQuarterRuler(quarters, asOf) {
  if (!quarters.length) return "";
  const labels = quarters
    .map(
      (quarter) =>
        `<div class="mini-story-quarter focus-ruler-quarter"><span class="mini-story-quarter-label">${escapeHtml(quarter.label)}</span><span class="mini-story-quarter-track"></span></div>`,
    )
    .join("");
  return `<div class="focus-ruler-row"><span class="focus-ruler-spacer" aria-hidden="true"></span><div class="mini-story-window focus-time-ruler" role="group" aria-label="Shared story time ruler, ${escapeHtml(quarters[0].label)} to ${escapeHtml(quarters[quarters.length - 1].label)}">${labels}<span class="mini-story-now focus-ruler-now" title="Evidence through ${escapeHtml(asOf || "")}">NOW</span></div><span class="focus-ruler-spacer" aria-hidden="true"></span><span class="focus-ruler-spacer focus-ruler-action" aria-hidden="true">Open story</span></div>`;
}

export function sortStories(stories, sort) {
  const rows = stories.slice();
  if (sort === "company") {
    return rows.sort((left, right) => left.companyName.localeCompare(right.companyName));
  }
  return rows.sort(
    (left, right) => right.latestDate.localeCompare(left.latestDate) || left.ticker.localeCompare(right.ticker),
  );
}

export function renderStoryList(stories, quarters, selectedTicker, { linkToProfile = false, asOf } = {}) {
  if (!stories.length) {
    return '<section class="dashboard-panel"><p class="status">No company has a dated signal or official RNS announcement in this period.</p></section>';
  }
  const items = stories
    .map((story) => {
      const rail = `<div class="mini-story-window" role="img" aria-label="${escapeHtml(`${story.ticker} quarter timeline`)}">${quarters.map((quarter) => renderLane(story, quarter)).join("")}<span class="mini-story-now" aria-hidden="true"></span></div>`;
      const alert = story.latestAlert;
      const severity = severityTitle(alert?.severity || story.severity);
      const relative = alert ? relativeDay(alert.date, asOf) : null;
      const price = priceLabel(alert?.price);
      const alertMarkup = alert
        ? `<p class="catalyst-latest-alert" data-severity-key="${escapeHtml(severityKey(alert.severity || story.severity))}"><strong>${escapeHtml(severity || "Recorded")}</strong><time>${escapeHtml(shortDay(alert.date))}${relative ? ` · ${escapeHtml(relative)}` : ""}</time>${price ? `<span class="catalyst-alert-price">Alert price ${escapeHtml(price)}</span>` : ""}</p>`
        : "";
      const href = linkToProfile
        ? `?view=current&amp;ticker=${encodeURIComponent(story.ticker)}`
        : `?view=story&amp;ticker=${encodeURIComponent(story.ticker)}`;
      return `<li class="catalyst-story-item" data-story-ticker="${escapeHtml(story.ticker)}" data-story-search="${escapeHtml(`${story.ticker} ${story.companyName}`.toLowerCase())}" data-severity="${escapeHtml(severity || "")}"><article class="catalyst-story-row"><div class="catalyst-story-identity"><div class="catalyst-company"><strong>${escapeHtml(story.companyName)}</strong><span class="catalyst-market-line"><strong>${escapeHtml(story.ticker)}</strong><span aria-hidden="true"> · </span><small>${escapeHtml(story.market || "Market unavailable")}</small></span></div>${alertMarkup}</div><div class="catalyst-story-middle">${rail}</div><a class="catalyst-open-story" href="${href}">Open story →</a></article></li>`;
    })
    .join("");
  return `<ol class="catalyst-story-list" data-catalyst-story-list>${items}</ol>`;
}

function eventCard(event) {
  const kindLabel = event.kind === "rns" ? "Official RNS" : "CrashDash signal";
  const link = event.href
    ? `<a href="${escapeHtml(event.href)}" target="_blank" rel="noreferrer">Open source ↗</a>`
    : "";
  return `<li class="story-event is-${event.kind}">
  <time datetime="${escapeHtml(event.date)}">${escapeHtml(humanDate(event.date) || event.date)}</time>
  <div><span class="story-event-kind">${escapeHtml(kindLabel)}</span>
    <strong>${escapeHtml(event.title)}</strong>
    <p>${escapeHtml(event.detail)}</p>
    ${link}
  </div>
</li>`;
}

export function renderStoryDetail(story, summary = null) {
  if (!story) {
    return '<section class="dashboard-panel"><p class="status">Select a company to review its story.</p></section>';
  }
  const quick = summary || {};
  const facts = [
    quick.exchange && `Exchange ${quick.exchange}`,
    quick.industry,
    quick.currentStatus,
    quick.dataQuality && `Data ${quick.dataQuality}`,
  ].filter(Boolean);

  const thirty = quick.whatTheyDo
    ? `<p>${escapeHtml(quick.whatTheyDo)}</p>`
    : `<p class="status" data-company-summary-status="${escapeHtml(quick.summaryStatus || "UNAVAILABLE")}">Company summary is not available for this company in the current data.</p>`;

  const events = story.events.slice().reverse();
  const cards = events.length
    ? `<ol class="story-events">${events.map(eventCard).join("")}</ol>`
    : '<p class="status">No dated event is visible at this point in time.</p>';

  return `<section class="dashboard-panel story-detail" data-story-detail="${escapeHtml(story.ticker)}">
  <header class="story-hero">
    <div>
      <p class="eyebrow">Story Mode</p>
      <h2>${escapeHtml(story.companyName)}</h2>
      <p class="instrument-meta">${escapeHtml(story.ticker)}${facts.length ? ` · ${escapeHtml(facts.join(" · "))}` : ""}</p>
    </div>
    <div class="story-hero-counts"><span>${escapeHtml(String(story.signalCount))} signal${story.signalCount === 1 ? "" : "s"}</span><span>${escapeHtml(String(story.rnsCount))} official RNS</span><span>${escapeHtml(humanDate(story.firstDate) || story.firstDate)} → ${escapeHtml(humanDate(story.latestDate) || story.latestDate)}</span></div>
  </header>
  <section class="story-thirty"><h3>Company in 30 seconds</h3>${thirty}${quick.whyItMatters ? `<p>${escapeHtml(quick.whyItMatters)}</p>` : ""}</section>
  <section class="story-history"><h3>Recorded events</h3><p class="context-note">Newest first. Each entry is a signal CrashDash recorded or an official announcement it stored; nothing is inferred, and later outcomes never rewrite earlier entries.</p>${cards}</section>
</section>`;
}

export function renderStoryHub({
  stories,
  quarters,
  selectedTicker,
  asOf,
  offset,
  bounds,
  summary,
  variant = "focus",
}) {
  const focus = variant === "focus";
  const sorted = sortStories(stories, "latest");
  const selected = sorted.find((story) => story.ticker === selectedTicker) || sorted[0] || null;
  const canGoEarlier = quarters.length > 0 && offset < (bounds?.maxOffset ?? 0);
  const canGoLater = offset > 0;
  const windowLabel = quarters.length
    ? `${quarters[0].label} – ${quarters[quarters.length - 1].label}`
    : "no period";
  const emptyNote = isEmptyWindow(sorted, quarters)
    ? `<p class="context-note" data-empty-window="true">No recorded event falls inside ${escapeHtml(windowLabel)}. Use the period controls to move to a quarter that contains events.</p>`
    : "";
  const toolbar = focus
    ? `<div class="focus-toolbar"><label class="focus-search"><input type="search" data-story-search aria-label="Search stories" placeholder="Company or ticker"></label><span class="dashboard-count" data-story-count>${sorted.length} stor${sorted.length === 1 ? "y" : "ies"}</span><label class="focus-sort"><span>Sort</span><select data-story-sort aria-label="Sort stories"><option value="latest">Latest alert</option><option value="changed">Recently changed</option><option value="company">Company name</option></select></label></div>`
    : "";
  const periodControls = `<div class="story-period-controls"><button type="button" data-story-period="earlier" ${canGoEarlier ? "" : "disabled"}>← Earlier</button><span class="story-period-label" data-story-window>${escapeHtml(windowLabel)}</span><button type="button" data-story-period="later" ${canGoLater ? "" : "disabled"}>Later →</button><button type="button" data-story-period="latest" data-story-latest-date="${escapeHtml(bounds?.max || "")}" ${offset === 0 && asOf === bounds?.max ? "disabled" : ""}>Latest evidence</button><label class="story-replay">Evidence date <input type="date" data-story-asof min="${escapeHtml(bounds?.min || "")}" max="${escapeHtml(bounds?.max || "")}" value="${escapeHtml(asOf)}"></label></div>`;
  const detail = focus ? "" : renderStoryDetail(selected, summary);

  return `<section class="product-feed catalyst-discovery no-upcoming" data-story-variant="${escapeHtml(variant)}">
  <header class="view-heading"><div><p class="eyebrow">Snapshot as of ${escapeHtml(asOf)}</p><h1>${focus ? "Stories in Focus" : "Story Mode"}</h1><p class="briefing-copy">${focus ? "What fell. What changed. What could happen next." : `Company story with evidence through ${escapeHtml(asOf)}.`}</p></div></header>
  <div class="focus-sticky-controls">${toolbar}${periodControls}<p class="focus-no-upcoming" role="status">No upcoming catalysts are recorded in this snapshot.</p>${renderQuarterRuler(quarters, asOf)}</div>
  ${emptyNote}
  ${renderStoryList(sorted, quarters, selected?.ticker || selectedTicker, { linkToProfile: focus, asOf })}
  ${detail}
</section>`;
}

/* ---------------------------------------------------------------------------
 * Inline story section for the Research instrument profile.
 *
 * The approved baseline showed the company story inside the profile page, not
 * only on its own route, so the profile answers "what is this company's story"
 * without a navigation jump. Everything here is derived from the same events
 * the Story Mode page uses; the snapshot answers only what the data supports.
 * ------------------------------------------------------------------------ */

function storySnapshot(story) {
  if (!story || !story.events.length) {
    return {
      happened: "No dated signal or official announcement is recorded for this company.",
      changed: "Nothing is recorded, so no change can be shown.",
      next: "No forward-looking catalyst is recorded in the available data.",
    };
  }
  const latest = story.events[story.events.length - 1];
  const earliest = story.events[0];
  const kind = latest.kind === "rns" ? "an official announcement" : "a CrashDash signal";
  return {
    happened: `${humanDate(earliest.date) || earliest.date} to ${humanDate(latest.date) || latest.date}: ${story.signalCount} CrashDash signal${story.signalCount === 1 ? "" : "s"} and ${story.rnsCount} official announcement${story.rnsCount === 1 ? "" : "s"} are recorded.`,
    changed: `The most recent recorded event is ${kind} on ${humanDate(latest.date) || latest.date}: ${latest.title}.`,
    next: "No forward-looking catalyst is recorded in the available data; nothing is inferred.",
  };
}

export function renderCompanyStory(story, { asOf, quarters } = {}) {
  const window = Array.isArray(quarters) && quarters.length ? quarters : quarterWindow(asOf);
  const head = `<p class="eyebrow">Story Mode · evidence through ${escapeHtml(asOf || "")}</p>`;
  if (!story) {
    return `<section class="dashboard-panel story-embed" data-company-story-empty="true">${head}<h3>Company story</h3><p class="status">No dated signal or official announcement is recorded for this company in the available data.</p></section>`;
  }
  const lane = window.map((quarter) => renderLane(story, quarter)).join("");
  const snapshot = storySnapshot(story);
  const cards = story.events.slice().reverse().map(eventCard).join("");
  const href = `?view=story&ticker=${encodeURIComponent(story.ticker)}`;
  return `<section class="dashboard-panel story-embed" data-company-story="${escapeHtml(story.ticker)}">
${head}<h3>Company story</h3>
<p class="context-note">${escapeHtml(String(story.events.length))} recorded moment${story.events.length === 1 ? "" : "s"} · ${escapeHtml(String(story.signalCount))} signal${story.signalCount === 1 ? "" : "s"} · ${escapeHtml(String(story.rnsCount))} official RNS · markers sit at their real date inside each quarter.</p>
${renderQuarterRuler(window, asOf)}
<div class="story-embed-lane">${lane}</div>
<div class="story-snapshot">
  <div><h4>What happened?</h4><p>${escapeHtml(snapshot.happened)}</p></div>
  <div><h4>What changed?</h4><p>${escapeHtml(snapshot.changed)}</p></div>
  <div><h4>What next?</h4><p>${escapeHtml(snapshot.next)}</p></div>
</div>
<details class="story-evidence"><summary>View evidence · ${escapeHtml(String(story.events.length))} recorded event${story.events.length === 1 ? "" : "s"}</summary><ol class="story-events">${cards}</ol></details>
<p class="story-embed-actions"><a href="${escapeHtml(href)}">View full story &amp; replay →</a></p>
</section>`;
}

/* ---------------------------------------------------------------------------
 * Company News: the official announcement feed.
 *
 * Every row is a stored RNS row the bundle already carries. The feed never
 * invents a time: when the provider gave no publication time, none is shown.
 * ------------------------------------------------------------------------ */

export function buildCompanyNews(stories) {
  const rows = [];
  for (const story of Array.isArray(stories) ? stories : []) {
    for (const event of story.events) {
      if (event.kind !== "rns") continue;
      rows.push({
        ticker: story.ticker,
        company: story.companyName,
        date: event.date,
        time: event.time || null,
        headline: event.title,
        sentiment: String(event.detail || "NEUTRAL").toUpperCase(),
        href: event.href || null,
        reference: event.reference || "RNS",
      });
    }
  }
  return rows.sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.ticker.localeCompare(right.ticker) || left.headline.localeCompare(right.headline),
  );
}

export function filterCompanyNews(rows, filters = {}) {
  const term = String(filters.search || "").trim().toLowerCase();
  const sentiment = String(filters.sentiment || "ALL").toUpperCase();
  return rows.filter((row) => {
    if (sentiment !== "ALL" && row.sentiment !== sentiment) return false;
    if (!term) return true;
    return `${row.ticker} ${row.company} ${row.headline}`.toLowerCase().includes(term);
  });
}

export function renderCompanyNews(rows, asOf, filters = {}) {
  const visible = filterCompanyNews(rows, filters);
  const sentiments = [...new Set(rows.map((row) => row.sentiment))].sort();
  const options = sentiments
    .map((value) => `<option value="${escapeHtml(value)}"${String(filters.sentiment || "ALL") === value ? " selected" : ""}>${escapeHtml(value)}</option>`)
    .join("");
  const items = visible
    .map((row) => {
      const time = row.time ? `<span class="company-news-time">${escapeHtml(row.time)}</span>` : "";
      const href = `?view=current&amp;ticker=${encodeURIComponent(row.ticker)}`;
      return `<li class="company-news-item" data-news-item data-ticker="${escapeHtml(row.ticker.toLowerCase())}" data-company="${escapeHtml(row.company.toLowerCase())}" data-headline="${escapeHtml(row.headline.toLowerCase())}" data-sentiment="${escapeHtml(row.sentiment)}"><a class="company-news-link" href="${href}"><time datetime="${escapeHtml(row.date)}">${time}<span class="company-news-date">${escapeHtml(humanDate(row.date) || row.date)}</span></time><span class="company-news-identity"><strong>${escapeHtml(row.ticker)}</strong><small>${escapeHtml(row.company)}</small></span><span class="company-news-copy"><strong>${escapeHtml(row.headline)}</strong><small><span class="company-news-category">Company announcement</span> · <span class="company-news-sentiment" data-sentiment="${escapeHtml(row.sentiment)}">${escapeHtml(row.sentiment)}</span>${row.href ? ` · <a href="${escapeHtml(row.href)}" target="_blank" rel="noreferrer">Open source ↗</a>` : ""}</small></span><span class="company-news-open">Research →</span></a></li>`;
    })
    .join("");

  return `<section class="product-feed company-news-view">
  <header class="view-heading"><div><p class="eyebrow">Company announcements · snapshot as of ${escapeHtml(asOf)}</p><h1>Company News</h1><p class="briefing-copy">RNS presentation events for the current Research universe, newest first. Source announcement content stays in the company detail.</p></div><p class="dashboard-count">${escapeHtml(String(rows.length))} announcement${rows.length === 1 ? "" : "s"}</p></header>
  <div class="company-news-toolbar"><label>Ticker or company<input type="search" data-news-search value="${escapeHtml(filters.search || "")}" placeholder="Search companies or headlines"></label><label>Sentiment<select data-news-sentiment><option value="ALL">All sentiment</option>${options}</select></label></div>
  <p class="context-note">An unavailable time is omitted; no midnight time is inferred. Sentiment reflects the stored announcement classification.</p>
  ${visible.length ? `<ol class="company-news-list">${items}</ol>` : '<p class="dashboard-empty" data-news-empty>No announcements match these filters.</p>'}
</section>`;
}

/* ---------------------------------------------------------------------------
 * Adapter: MVP history + instrument RNS -> the approved story artifact shape
 * that current_story_viewer.js renders.
 *
 * Nothing is inferred. Every timeline entry is either a signal the engine
 * recorded or an announcement it stored, and no future catalyst is added.
 * ------------------------------------------------------------------------ */

function toTwentyFourHour(value) {
  const match = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/.exec(String(value || "").trim());
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = (match[3] || "").toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (hour > 23) return "";
  return `${String(hour).padStart(2, "0")}:${minute}`;
}


/* Alert episodes. Ported from the approved sandbox rule
 * (docs/product/catalyst-sandbox/episodes.mjs): consecutive signals for the same
 * ticker, with the same signal type and the same accumulation state, no more
 * than MAX_EPISODE_GAP_DAYS apart, form one episode. Raw records are never
 * rewritten -- the episode is a presentation wrapper around its members. */
export const MAX_EPISODE_GAP_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (value) => Date.parse(`${value}T00:00:00Z`) / DAY_MS;

export function deriveSignalEpisodes(events) {
  const signals = events
    .filter((event) => event.kind === "signal")
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date) || String(left.reference).localeCompare(String(right.reference)));
  const groups = [];
  for (const event of signals) {
    const previousGroup = groups[groups.length - 1];
    const previous = previousGroup?.[previousGroup.length - 1];
    const continues = previous
      && previous.signalType === event.signalType
      && previous.accumulation === event.accumulation
      && dayNumber(event.date) - dayNumber(previous.date) <= MAX_EPISODE_GAP_DAYS;
    if (!continues) groups.push([event]);
    else previousGroup.push(event);
  }
  return groups.map((members) => {
    const severities = [...new Set(members.map((member) => member.detail).filter(Boolean))];
    const activity = members.map((member) => member.activity).filter((value) => value !== null);
    return {
      members,
      startDate: members[0].date,
      endDate: members[members.length - 1].date,
      count: members.length,
      severity: severities[0] || null,
      classificationChanged: severities.length > 1,
      peakActivity: activity.length ? Math.max(...activity) : null,
    };
  });
}

/* Same-day announcements collapse into one rail point: the timeline should show
 * the day the company spoke, not one node per release. Every headline and source
 * is retained inside the merged event. */
export function mergeSameDayAnnouncements(events) {
  const byDay = new Map();
  const merged = [];
  for (const event of events) {
    if (event.kind !== "rns") {
      merged.push(event);
      continue;
    }
    const key = `${event.ticker}|${event.date}`;
    const bucket = byDay.get(key);
    if (!bucket) {
      const entry = { ...event, sameDay: [event] };
      byDay.set(key, entry);
      merged.push(entry);
      continue;
    }
    bucket.sameDay.push(event);
    bucket.title = `${bucket.sameDay[0].title} (+${bucket.sameDay.length - 1} more)`;
    if (event.href && bucket.sameDay.length === 2) bucket.href = bucket.href || event.href;
  }
  return merged.sort((left, right) => left.date.localeCompare(right.date));
}

export function buildStoryArtifact(stories, ticker, asOf, { rnsRows = [], featuredLimit = 10 } = {}) {
  const story = stories.find((item) => item.ticker === ticker);
  if (!story) return null;

  const rawSignals = story.events.filter((event) => event.kind === "signal");
  const rawRns = story.events.filter((event) => event.kind === "rns");

  const rowsByKey = new Map();
  for (const row of rnsRows || []) {
    if (row?.rns_number) rowsByKey.set(`RNS ${row.rns_number}`, row);
    if (row?.headline) rowsByKey.set(String(row.headline).trim(), row);
  }
  const findRow = (event) =>
    rowsByKey.get(event.reference) || rowsByKey.get(String(event.title).trim()) || null;

  /* The evidence list is every retained source record, one entry per signal and
   * per announcement, so the counts match what the bundle actually holds. */
  const sources = [];
  const signalSourceId = new Map();
  for (const event of rawSignals) {
    const id = `source:signal:${event.reference}`;
    signalSourceId.set(event.reference, id);
    sources.push({
      id,
      kind: "crashdash_signal",
      known_at: event.date,
      url: "",
      record: {
        signal_id: event.reference,
        signal_state: event.signalType,
        legacy_signal_color: event.rawColor,
        watch_severity: event.detail,
      },
    });
  }
  const rnsSourceId = new Map();
  for (const event of rawRns) {
    const id = `source:rns:${event.reference || `${event.date}:${event.title}`}`;
    rnsSourceId.set(event, id);
    sources.push({
      id,
      kind: "rns",
      known_at: event.date,
      url: event.href || "",
      record: {
        headline: event.title,
        rating: event.detail,
        detail_url: event.href || "",
        source_url: event.href || "",
      },
    });
  }

  /* Points on the rail collapse runs of alerts and same-day announcements. */
  const timeline = [];
  const alertEpisodes = [];
  for (const episode of deriveSignalEpisodes(story.events)) {
    const single = episode.count === 1;
    const member = episode.members[0];
    const id = single
      ? `event:crashdash_signal:${member.reference}`
      : `event:crashdash_episode:${member.reference}`;
    timeline.push({
      id,
      source_id: signalSourceId.get(member.reference) || "",
      type: single ? "crashdash_signal" : "crashdash_episode",
      date: episode.startDate,
      end_date: episode.endDate,
      published_at: episode.startDate,
      title: single ? "Alert" : "Alert run",
      signal_count: episode.count,
      watch_severity: episode.severity,
      members: episode.members.map((item) => ({
        signal_date: item.date,
        watch_severity: item.detail,
        signal_id: item.reference,
        relative_activity: item.activity,
      })),
      presentation: {
        watch_severity: episode.severity,
        summary: single
          ? "CrashDash flagged unusual activity in the company."
          : `CrashDash flagged the company ${episode.count} times during this period.`,
      },
    });
    if (!single) {
      alertEpisodes.push({
        date: episode.startDate,
        end_date: episode.endDate,
        signal_count: episode.count,
        watch_severity: episode.severity,
        members: episode.members.map((item) => ({
          signal_date: item.date,
          watch_severity: item.detail,
          signal_id: item.reference,
          relative_activity: item.activity,
        })),
      });
    }
  }

  for (const event of mergeSameDayAnnouncements(rawRns)) {
    const group = Array.isArray(event.sameDay) ? event.sameDay : [event];
    const primary = findRow(group[0]) || findRow(event);
    const body = typeof primary?.content === "string" ? primary.content.trim() : "";
    const headlines = group.map((item) => item.title);
    timeline.push({
      id: `event:rns:${event.reference || `${event.date}:${event.title}`}`,
      source_id: rnsSourceId.get(group[0]) || "",
      type: "rns",
      date: event.date,
      published_at: event.date,
      title: event.title,
      presentation: {
        rating: event.detail,
        summary: headlines.length > 1
          ? `The company published ${headlines.length} announcements: ${headlines.join("; ")}.`
          : `The company published an announcement titled “${event.title}”.`,
        full_announcement: body,
        key_points: Array.isArray(primary?.key_points) ? primary.key_points : [],
        publication_time: toTwentyFourHour(event.time),
        publication_timezone: "Europe/London",
      },
    });
  }

  timeline.sort((left, right) => left.date.localeCompare(right.date));

  /* The replay list is every retained event, not just the featured points. */
  const datedTimeline = story.events
    .filter((event) => event.date)
    .map((event) => ({
      date: event.date,
      type: event.kind === "rns" ? "rns" : "crashdash_signal",
      headline: event.kind === "rns" ? event.title : "CrashDash alert",
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const featured = timeline.slice(-featuredLimit).map((event) => event.id);
  const latest = timeline[timeline.length - 1];
  const earliest = timeline[0];
  return {
    ticker,
    company_name: story.companyName,
    as_of: asOf,
    headline: "Company updates and CrashDash alert activity.",
    snapshot: {
      happened: `${earliest.date} to ${latest.date}: ${rawSignals.length} CrashDash signal${rawSignals.length === 1 ? "" : "s"} and ${rawRns.length} announcement${rawRns.length === 1 ? "" : "s"} are recorded.`,
      changed: `The most recent recorded event is ${latest.title} on ${latest.date}.`,
      next: "No upcoming catalyst identified in this snapshot.",
    },
    evidence_counts: {
      events: rawSignals.length + rawRns.length,
      alerts: rawSignals.length,
      rns: rawRns.length,
    },
    sources,
    timeline: datedTimeline,
    alert_episodes: alertEpisodes,
    presentation_timeline: timeline,
    featured_presentation_event_ids: featured,
    future_catalysts: [],
  };
}
