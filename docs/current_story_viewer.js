/** Story-first presentation shared by current-data company Catalyst surfaces. */
import { formatQuotePrice } from "./browser.js?v=20261017T145150Z";
const safeExternalUrl = (value) => typeof value === "string" && /^https:\/\//i.test(value) ? value : "";
const storyScrollBehavior = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

function storyEventSource(event, sources) {
  return sources.find((source) => source.id === event.source_id) || {};
}

function storyEventRecord(event, sources) {
  const source = storyEventSource(event, sources);
  if (event.type !== "rns") return source.record || {};
  return {
    ...(source.record || {}),
    ...(event.presentation || {}),
    headline: event.headline || source.record?.headline,
    announcement_class: event.announcement_class || source.record?.announcement_class,
  };
}

function cleanTone(value) {
  const tone = String(value || "").trim().toUpperCase().replace(/[ -]+/g, "_");
  if (tone.includes("BULLISH") || tone.includes("POSITIVE")) return "bullish";
  if (tone.includes("BEARISH") || tone.includes("NEGATIVE")) return "bearish";
  if (tone.includes("CAUTION")) return "caution";
  if (tone.includes("NEUTRAL")) return "neutral";
  if (tone === "MIXED") return "mixed";
  return "unclassified";
}

function severityClass(value) {
  return String(value || "unavailable").toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") || "unavailable";
}

function signalClose(record) {
  const value = Number(record.price_at_signal);
  const unit = String(record.quote_unit || "").toUpperCase();
  if (!Number.isFinite(value) || record.quote_unit_status !== "CERTIFIED_LOCAL_SOURCE" || !["GBP", "GBX"].includes(unit)) return "";
  const formatted = formatQuotePrice(value, unit);
  if (!formatted) return "";
  return unit === "GBP" ? `£${formatted}` : formatted;
}

function sentimentLabel(tone) {
  return tone === "unclassified" ? "Unclassified" : tone[0].toUpperCase() + tone.slice(1);
}

function severityLabel(value) {
  const labels = {
    "CLOSE WATCH": "Close Watch",
    ELEVATED: "Elevated",
    HIGH: "High",
    "EXTREME CAUTION": "Extreme Caution",
  };
  return labels[String(value || "").toUpperCase()] || "Severity unavailable";
}

function alertRailCue(record) {
  const severity = severityLabel(record.watch_severity);
  return severity === "Severity unavailable" ? "Unclassified alert" : severity;
}

function alertSelectionSemantic(record) {
  return alertRailCue(record);
}

function episodeSemantic(event) {
  const labels = [alertRailCue({ watch_severity: event.watch_severity })];
  if (event.accumulation_state === "DETECTED") labels.push("Accumulation detected");
  return labels.join(" · ");
}

function selectionMetricPairs(event, record, sources = []) {
  if (event.type === "crashdash_episode") {
    const latestMember = episodeMembers(event, sources).sort((a, b) => String(a.signal_date || "").localeCompare(String(b.signal_date || ""))).at(-1);
    const latestPrice = latestMember ? signalClose(latestMember) : "";
    return [
      ["Alerts", String(event.signal_count)],
      ...(Number.isFinite(Number(event.peak_activity)) ? [["Peak activity", `${event.peak_activity}×`]] : []),
      ...(latestPrice ? [["Latest signal-session close", latestPrice]] : []),
    ];
  }
  if (event.type !== "crashdash_signal") return [];
  const activity = Number(record.relative_activity);
  const close = signalClose(record);
  return [
    ...(Number.isFinite(activity) && activity > 0 ? [["Relative activity", `${record.relative_activity}×`]] : []),
    ...(close ? [["Signal close", close]] : []),
  ];
}

function metricsData(pairs) {
  return pairs.map(([label, value]) => `${label}: ${value}`).join(" · ");
}

function metricsMarkup(pairs, escapeHtml) {
  return pairs.map(([label, value]) => `<span>${escapeHtml(label)} <strong>${escapeHtml(value)}</strong></span>`).join("");
}

function validPublicationTime(value) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "";
}

function cleanRnsPresentationText(value) {
  const navigation = new Set(["home", "markets", "market data", "news", "companies", "share prices", "watchlist", "my watchlist", "search", "login", "log in", "register", "contact us", "help", "privacy policy", "terms and conditions"]);
  return String(value || "").split(/\r?\n/).filter((line) => {
    const normalized = line.trim().toLowerCase().replace(/\s+/g, " ");
    if (navigation.has(normalized)) return false;
    const parts = normalized.split(/[|•·›>]+/).map((part) => part.trim()).filter(Boolean);
    return !(parts.length >= 2 && parts.every((part) => navigation.has(part)));
  }).join("\n").trim();
}

function renderRnsProvenance(event, sources, escapeHtml) {
  const sourceIds = Array.isArray(event.source_ids) ? event.source_ids : [event.source_id].filter(Boolean);
  const members = sourceIds.map((id) => sources.find((source) => source.id === id)).filter(Boolean);
  if (!members.length) return "";
  const links = members.map((source) => {
    const sourceName = String(source.record?.source || "RNS").trim();
    const url = safeExternalUrl(source.url || source.record?.detail_url || source.record?.source_url);
    return url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">View source${members.length > 1 ? ` (${escapeHtml(sourceName)})` : ""} ↗</a>`
      : `<span>${escapeHtml(sourceName)}</span>`;
  }).join("");
  return `<div class="current-story-rns-provenance"><span>Sources</span>${links}</div>`;
}

function renderRnsDetail(event, record, sources, escapeHtml) {
  const keyPoints = Array.isArray(record.key_points) ? record.key_points.slice(0, 4) : [];
  const full = cleanRnsPresentationText(record.full_announcement);
  const price = record.price_context?.label && record.price_context?.value
    ? `<p class="current-story-rns-price-context">${escapeHtml(record.price_context.label)}: <strong>${escapeHtml(record.price_context.value)}</strong></p>` : "";
  return `<div class="current-story-rns-detail"><h4>What happened</h4><p data-selected-event-description>${escapeHtml(record.summary || rnsSummary(record))}</p>${price}${keyPoints.length ? `<section class="current-story-rns-key-points"><h4>Key points</h4><ul>${keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul></section>` : ""}${full ? `<details class="current-story-full-rns"><summary>View full announcement</summary><pre>${escapeHtml(full)}</pre></details>` : ""}${renderRnsProvenance(event, sources, escapeHtml)}</div>`;
}

export function rnsPriceContext(event, instrumentDetail) {
  const time = validPublicationTime(event.publication_time || event.presentation?.publication_time);
  const identity = instrumentDetail?.identity || instrumentDetail?.company_metadata || {};
  const unit = String(identity.quote_unit || "").toUpperCase();
  if (!time || identity.quote_unit_status !== "CERTIFIED_LOCAL_SOURCE" || !["GBP", "GBX"].includes(unit)) return null;
  const bar = (instrumentDetail.price_series || []).find((point) => point.date === event.date);
  const close = Number(bar?.close);
  if (!Number.isFinite(close) || close <= 0) return null;
  const formatted = formatQuotePrice(close, unit);
  if (!formatted) return null;
  const value = unit === "GBP" ? `£${formatted}` : formatted;
  const minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const label = minute >= 990 ? "After market close · same-day close preceded announcement" : minute < 480 ? "Published before market hours · day close followed publication" : "Published during market hours · day close";
  return { label, value };
}

function shortStoryDate(value) {
  const raw = String(value || "").slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : null;
  return date && !Number.isNaN(date.valueOf())
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date)
    : value ? String(value) : "Date unavailable";
}

function storyDateRange(start, end) {
  if (!end || start === end) return shortStoryDate(start);
  const a = new Date(`${String(start).slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${String(end).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a.valueOf()) || Number.isNaN(b.valueOf())) return `${shortStoryDate(start)}–${shortStoryDate(end)}`;
  const day = (date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" }).format(date);
  const month = (date) => new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(date);
  const year = (date) => new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "UTC" }).format(date);
  if (year(a) !== year(b)) return `${shortStoryDate(start)}–${shortStoryDate(end)}`;
  if (month(a) === month(b)) return `${day(a)}–${day(b)} ${month(a)} ${year(a)}`;
  return `${day(a)} ${month(a)}–${day(b)} ${month(b)} ${year(a)}`;
}

function quarterLabel(value) {
  const match = String(value || "").slice(0, 10).match(/^(\d{4})-(\d{2})-/);
  return match ? `Q${Math.ceil(Number(match[2]) / 3)} ${match[1]}` : "Date unavailable";
}

function timelineSpacing(from, to) {
  const parse = (value) => {
    const day = String(value || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(`${day}T00:00:00Z`) : NaN;
  };
  const start = parse(from);
  const end = parse(to);
  const days = Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, Math.round((end - start) / 86400000))
    : 0;
  const yearMarks = [];
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    const first = new Date(start).getUTCFullYear() + 1;
    const last = new Date(end).getUTCFullYear();
    for (let year = first; year <= last; year += 1) {
      const boundary = Date.UTC(year, 0, 1);
      if (boundary <= start || boundary > end) continue;
      yearMarks.push({ year, position: Math.round(((boundary - start) / (end - start)) * 100) });
    }
  }
  const chronologicalGap = 12 + days * 0.35;
  const yearOrientationGap = yearMarks.length ? 16 + yearMarks.length * 88 : 0;
  const gap = Math.round(Math.min(480, Math.max(12, chronologicalGap, yearOrientationGap)));
  const wholeYears = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const durationLabel = wholeYears ? `${wholeYears}y${months ? ` ${months}m` : ""}` : `${Math.floor(days / 30)}m`;
  return { days, gap, yearMarks, durationLabel, dormant: false };
}

function episodeMembers(event, sources) {
  const memberIds = new Set(event.member_source_ids || []);
  return sources.filter((source) => memberIds.has(source.id)).map((source) => ({
    ...source.record, signal_id: source.source_id, signal_date: source.record?.signal_date || source.known_at,
  }));
}

function renderEpisodeExpansion(members, escapeHtml) {
  if (!members.length) return "";
  const rows = members.map((member) => {
    const activity = Number(member.relative_activity);
    const activityText = Number.isFinite(activity) && activity > 0 ? `${activity}× activity` : "Activity unavailable";
    const raw = JSON.stringify(member, null, 2);
    return `<li><strong>${escapeHtml(shortStoryDate(member.signal_date))} · ${escapeHtml(severityLabel(member.watch_severity))} · ${escapeHtml(activityText)}</strong><details><summary>View source fields</summary><span>Signal ID: ${escapeHtml(member.signal_id || "Unavailable")}</span><span>Classification: ${escapeHtml(member.signal_state || member.signal_type || "Unavailable")}${member.legacy_signal_color ? ` · Source color: ${escapeHtml(member.legacy_signal_color)}` : ""}</span><details><summary>Raw alert fields</summary><pre>${escapeHtml(raw)}</pre></details></details></li>`;
  }).join("");
  return `<details class="current-story-episode-members"><summary>View ${members.length} alerts</summary><ol>${rows}</ol></details>`;
}

function createEpisodeExpansion(members) {
  if (!members.length) return null;
  const details = document.createElement("details");
  details.className = "current-story-episode-members";
  const summary = document.createElement("summary");
  summary.textContent = `View ${members.length} alerts`;
  details.append(summary);
  const list = document.createElement("ol");
  for (const member of members) {
    const item = document.createElement("li");
    const activity = Number(member.relative_activity);
    const first = document.createElement("strong");
    first.textContent = `${shortStoryDate(member.signal_date)} · ${severityLabel(member.watch_severity)} · ${Number.isFinite(activity) && activity > 0 ? `${activity}× activity` : "Activity unavailable"}`;
    const id = document.createElement("span");
    id.textContent = `Signal ID: ${member.signal_id || "Unavailable"}`;
    const classification = document.createElement("span");
    classification.textContent = `Classification: ${member.signal_state || member.signal_type || "Unavailable"}${member.legacy_signal_color ? ` · Source color: ${member.legacy_signal_color}` : ""}`;
    const raw = document.createElement("details");
    const rawSummary = document.createElement("summary");
    rawSummary.textContent = "Raw alert fields";
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(member, null, 2);
    raw.append(rawSummary, pre);
    const fields = document.createElement("details");
    const fieldsSummary = document.createElement("summary");
    fieldsSummary.textContent = "View source fields";
    fields.append(fieldsSummary, id, classification, raw);
    item.append(first, fields);
    list.append(item);
  }
  details.append(list);
  return details;
}

function rnsSummary(record) {
  const supplied = [record.user_summary, record.factual_summary, record.summary, record.description, record.synopsis, record.extracted_summary]
    .find((value) => typeof value === "string" && value.trim());
  if (supplied) {
    const summary = supplied.trim();
    return summary.length > 220 ? `${summary.slice(0, 217).trimEnd()}…` : summary;
  }
  const rawHeadline = String(record.headline || "").trim().replace(/\s+/g, " ");
  const headline = rawHeadline.toLowerCase();
  const lowerFirst = (value) => value.trim().replace(/\b[A-Z][a-z]+\b/g, (word) => word.toLowerCase());
  const updateSubject = rawHeadline.match(/^update\s+(?:on|of|regarding)\s+(.+)$/i);
  if (updateSubject) return `The company published an update relating to ${lowerFirst(updateSubject[1]).replace(/[.!?]+$/, "")}.`;
  if (/^company\s+update$/i.test(rawHeadline)) return "The company published a company update.";
  if (/holding\(s\) in company|holding in company/.test(headline)) return "A shareholder holding disclosure was published.";
  if (/director\/pd m?r|director.*shareholding|pdmr.*shareholding/.test(headline)) return "A director or senior manager shareholding notice was published.";
  if (/result of agm|agm results/.test(headline)) return "The company published the outcome of its annual general meeting.";
  if (/notice of (?:the )?agm/.test(headline)) return "The company published notice of its annual general meeting.";
  if (/full[ -]year results|annual results/.test(headline)) return "The company published its annual financial results.";
  if (/interim results|half[ -]year.*results/.test(headline)) return "The company published interim financial results.";
  if (/trading update/.test(headline)) return "The company published an update on trading.";
  if (/fundrais|placing|subscription|loan note|debt facility/.test(headline)) return "The company announced a funding or financing update.";
  if (/board changes?|director appointment|director resignation/.test(headline)) return "The company announced a change to its board.";
  const transaction = rawHeadline.match(/^(conversion of|sale of|acquisition of|disposal of)\s+(.+)$/i);
  if (transaction) return `The company announced ${transaction[1].toLowerCase()} ${lowerFirst(transaction[2]).replace(/[.!?]+$/, "")}.`;
  if (!rawHeadline) return "No announcement summary is available in this snapshot.";
  return `The company published an announcement titled “${rawHeadline.replace(/[.!?]+$/, "")}.”`;
}

function storyEventMarkup(event, selected, sources, escapeHtml, spacing, quarterStart) {
  const source = storyEventSource(event, sources);
  const record = storyEventRecord(event, sources);
  const isEpisode = event.type === "crashdash_episode";
  const isSignal = event.type === "crashdash_signal" || isEpisode;
  const type = isEpisode ? "Alert run" : isSignal ? "Alert" : "RNS company update";
  const title = isEpisode ? "Alert run" : isSignal ? "Alert" : String(event.headline || "Company announcement");
  const severity = String(record.watch_severity || "");
  const severityToken = severityClass(isEpisode ? event.watch_severity : severity);
  const tone = cleanTone(record.sentiment || record.announcement_class || record.category || record.rating || record.classification || record.tone);
  const url = safeExternalUrl(record.detail_url || record.source_url || source.url);
  const description = isEpisode ? `CrashDash flagged the company ${event.signal_count} times during this period.` : isSignal ? "CrashDash flagged unusual activity in the company." : rnsSummary(record);
  const dateLabel = isEpisode ? storyDateRange(event.date, event.end_date) : shortStoryDate(event.date);
  const publicationTime = !isSignal ? validPublicationTime(event.presentation?.publication_time || event.publication_time) : "";
  const semanticClass = isSignal ? `severity-${severityToken}` : `sentiment-${tone}`;
  const context = isEpisode ? alertRailCue({ watch_severity: event.watch_severity }) : isSignal ? alertRailCue(record) : `RNS · ${sentimentLabel(tone)}`;
  const semantic = isEpisode ? episodeSemantic(event) : isSignal ? alertSelectionSemantic(record) : `Company update · ${sentimentLabel(tone)}`;
  const members = isEpisode ? sources
    .filter((item) => (event.member_source_ids || []).includes(item.id))
    .map((item) => ({ ...item.record, signal_id: item.source_id, signal_date: item.record?.signal_date || item.known_at })) : [];
  const metrics = metricsData(selectionMetricPairs(event, record, sources));
  const rnsSources = !isSignal ? (event.source_ids || [event.source_id].filter(Boolean)).map((id) => {
    const member = sources.find((item) => item.id === id);
    return { name: String(member?.record?.source || "RNS"), url: safeExternalUrl(member?.url || member?.record?.detail_url || member?.record?.source_url) };
  }) : [];
  const gapMarkup = spacing.days >= 180 || spacing.yearMarks.length ? `<span class="current-story-gap-guide" aria-hidden="true">${spacing.dormant ? `<span class="current-story-gap-label">quiet · ${spacing.durationLabel}</span>` : ""}${spacing.yearMarks.map((mark) => `<span class="current-story-year-mark" style="left:${mark.position}%"><span>${mark.year}</span></span>`).join("")}</span>` : "";
  const typeClass = isEpisode ? "episode" : isSignal ? "signal" : "rns";
  const marker = isEpisode ? '<span class="current-story-marker current-story-episode-marker" aria-hidden="true">●</span>'
    : isSignal ? '<span class="current-story-marker" aria-hidden="true">●</span>'
      : '<span class="current-story-marker" aria-hidden="true"><span class="current-story-rns-glyph">◆</span></span>';
  const latestEpisodeMember = members.slice().sort((a, b) => String(a.signal_date || "").localeCompare(String(b.signal_date || ""))).at(-1);
  const priceContext = record.price_context?.value || (isEpisode ? signalClose(latestEpisodeMember || {}) : isSignal ? signalClose(record) : "");
  return `<li class="current-story-event event-${typeClass} ${semanticClass}" data-quarter="${escapeHtml(quarterLabel(event.date))}" data-quarter-start="${quarterStart}" data-time-gap-days="${spacing.days}" style="--story-gap:${spacing.gap}px"><button type="button" data-current-story-event="${escapeHtml(event.id)}" data-event-type="${isEpisode ? "episode" : isSignal ? "signal" : "rns"}" data-event-date="${escapeHtml(dateLabel)}" data-event-date-iso="${escapeHtml(event.date || "")}" data-event-end-date-iso="${escapeHtml(event.end_date || event.date || "")}" data-event-title="${escapeHtml(title)}" data-event-description="${escapeHtml(description)}" data-event-semantic="${escapeHtml(semantic)}" data-event-metrics="${escapeHtml(metrics)}" data-event-members="${escapeHtml(JSON.stringify(members))}" data-event-url="${escapeHtml(url)}" data-event-rns-summary="${escapeHtml(record.summary || description)}" data-event-rns-points="${escapeHtml(JSON.stringify(record.key_points || []))}" data-event-rns-full="${escapeHtml(record.full_announcement || "")}" data-event-rns-sources="${escapeHtml(JSON.stringify(rnsSources))}" data-event-rns-price-label="${escapeHtml(record.price_context?.label || "")}" data-event-rns-price-value="${escapeHtml(record.price_context?.value || "")}" data-event-tone="${escapeHtml(isSignal ? severityToken : tone)}" data-event-severity="${escapeHtml(severityLabel(isEpisode ? event.watch_severity : severity))}" data-event-severity-class="${escapeHtml(severityToken)}" data-event-sentiment="${escapeHtml(tone)}" aria-label="${escapeHtml(`${dateLabel}${publicationTime ? ` at ${publicationTime} ${event.presentation?.publication_timezone || event.publication_timezone || ""}` : ""}, ${type}, ${title}, ${context}${isEpisode ? `, ${event.signal_count} alerts` : ""}${priceContext ? `, close ${priceContext}` : ""}`)}" aria-pressed="${selected}">${marker}<span class="current-story-event-meta"><time datetime="${escapeHtml(event.published_at || event.date || "")}">${escapeHtml(dateLabel)}</time>${publicationTime ? `<span class="current-story-event-time" title="Publication time · ${escapeHtml(event.presentation?.publication_timezone || event.publication_timezone || "Europe/London")}">${escapeHtml(publicationTime)}</span>` : ""}${priceContext ? `<span class="current-story-event-price">${escapeHtml(priceContext)}</span>` : ""}</span><span class="current-story-event-kind">${escapeHtml(context)}</span><strong>${escapeHtml(title)}</strong>${isEpisode ? `<span class="current-story-event-count">${event.signal_count} alerts</span>` : ""}</button>${gapMarkup}</li>`;
}

function renderSelectedEvent(event, sources, escapeHtml) {
  if (!event) return "";
  const source = storyEventSource(event, sources);
  const record = storyEventRecord(event, sources);
  const isEpisode = event.type === "crashdash_episode";
  const isSignal = event.type === "crashdash_signal" || isEpisode;
  const title = isEpisode ? "Alert run" : isSignal ? "Alert" : String(event.headline || "Company announcement");
  const tone = cleanTone(record.sentiment || record.announcement_class || record.category || record.rating || record.classification || record.tone);
  const description = isEpisode ? `CrashDash flagged the company ${event.signal_count} times during this period.` : isSignal ? "CrashDash detected unusual activity in the shares." : rnsSummary(record);
  const dateLabel = isEpisode ? storyDateRange(event.date, event.end_date) : shortStoryDate(event.date);
  const publicationTime = !isSignal ? validPublicationTime(record.publication_time || event.publication_time) : "";
  const selectedDateLabel = `${dateLabel}${publicationTime ? ` · ${publicationTime}` : ""}`;
  const severity = String(isEpisode ? event.watch_severity || "" : record.watch_severity || "");
  const severityToken = severityClass(severity);
  const semantic = isEpisode ? episodeSemantic(event) : isSignal ? alertSelectionSemantic(record) : `Company update · ${sentimentLabel(tone)}`;
  const metrics = metricsMarkup(selectionMetricPairs(event, record, sources), escapeHtml);
  const url = safeExternalUrl(record.detail_url || record.source_url || source.url);
  const action = isEpisode
    ? renderEpisodeExpansion(episodeMembers(event, sources), escapeHtml)
    : !isSignal
    ? `<div data-selected-event-action>${renderRnsDetail(event, record, sources, escapeHtml)}</div>`
    : url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${isSignal ? "View evidence →" : "View source →"}</a>`
    : isSignal ? '<a href="#alert-history-heading">View evidence ↓</a>' : "";
  const rnsDescription = !isSignal ? action : `<p data-selected-event-description>${escapeHtml(description)}</p>`;
  return `<section class="current-story-selected-event event-${isEpisode ? "episode" : isSignal ? "signal" : "rns"} ${isSignal ? `severity-${severityToken}` : `sentiment-${tone}`}" aria-live="polite" aria-atomic="true"><time datetime="${escapeHtml(record.published_at || event.published_at || event.date || "")}" data-selected-event-date>${escapeHtml(selectedDateLabel)}</time><h3 data-selected-event-title>${escapeHtml(title)}</h3><p class="current-story-selected-semantic" data-selected-event-semantic>${escapeHtml(semantic)}</p>${rnsDescription}<div class="current-story-event-metrics" data-selected-event-metrics>${metrics}</div>${isSignal ? `<div data-selected-event-action>${action}</div>` : ""}</section>`;
}

export function renderCurrentCatalystStory(story, ticker, escapeHtml, { compact = false, rnsStoryEvents = [], selectedEventId = "", instrumentDetail = null } = {}) {
  if (!story) return `<section class="status error-panel"><p>No current Catalyst story artifact is available for ${escapeHtml(ticker)}.</p></section>`;
  const sources = story.sources || [];
  const rnsDetailById = new Map((Array.isArray(rnsStoryEvents) ? rnsStoryEvents : [])
    .filter((event) => event?.story_event_id)
    .map((event) => [event.story_event_id, event]));
  const storyTimeline = (story.presentation_timeline || story.timeline || []).map((event) => {
    const detail = rnsDetailById.get(event.id);
    if (event.type !== "rns") return event;
    if (!detail) return { ...event, presentation: { ...(event.presentation || {}), price_context: rnsPriceContext(event, instrumentDetail) } };
    return {
      ...event,
      presentation: {
        ...(event.presentation || {}),
        summary: detail.summary ?? event.presentation?.summary,
        key_points: detail.key_points ?? event.presentation?.key_points,
        full_announcement: detail.full_announcement ?? event.presentation?.full_announcement,
        price_context: rnsPriceContext(event, instrumentDetail),
      },
    };
  });
  const featured = new Set(story.featured_presentation_event_ids || story.featured_event_ids || []);
  const points = storyTimeline.filter((event) => featured.has(event.id) || event.id === selectedEventId)
    .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")));
  const selected = points.find((event) => event.id === selectedEventId) || points.at(-1);
  const timeline = points.map((event, index) => {
    const gapStart = event.end_date || event.date;
    const nextDate = points[index + 1]?.date || story.as_of;
    const quarter = quarterLabel(event.date);
    const quarterStart = index === 0 || quarterLabel(points[index - 1].date) !== quarter;
    const spacing = timelineSpacing(gapStart, nextDate);
    const hiddenMoment = storyTimeline.some((item) => item.id !== event.id && String(item.date || "") > String(gapStart || "") && String(item.date || "") < String(nextDate || ""));
    spacing.dormant = spacing.days >= 180 && !hiddenMoment;
    return storyEventMarkup(event, event.id === selected?.id, sources, escapeHtml, spacing, quarterStart);
  }).join("");
  const future = (story.future_catalysts || []).filter((item) => item && item.date && String(item.date).slice(0, 10) > String(story.as_of || "").slice(0, 10));
  const futureContent = future.length
    ? future.map((item) => `<article class="current-story-future-event"><time datetime="${escapeHtml(item.date)}">${escapeHtml(shortStoryDate(item.date))}</time><strong>${escapeHtml(item.title || item.headline || "Expected catalyst")}</strong>${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}</article>`).join("")
    : `<p>No upcoming catalyst identified in this snapshot.</p>`;
  const evidence = sources.map((source) => {
    const safeUrl = safeExternalUrl(source.url || source.record?.detail_url || source.record?.source_url);
    const detail = source.kind === "crashdash_signal"
      ? [source.record?.signal_state ? `Classification: ${escapeHtml(source.record.signal_state)}` : "", source.record?.legacy_signal_color ? `Source color: ${escapeHtml(source.record.legacy_signal_color)}` : ""].filter(Boolean).join(" · ")
      : "";
    return `<li><strong>${escapeHtml(source.kind === "rns" ? source.record?.headline || "Company announcement" : "CrashDash alert")}</strong><span>${escapeHtml(source.known_at || "Date unavailable")}${detail}</span>${safeUrl ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>` : ""}</li>`;
  }).join("");
  const datedEvents = (story.timeline || []).filter((event) => event.date).map((event) => `<li data-event-date="${escapeHtml(event.date)}"><time>${escapeHtml(event.date)}</time> · ${escapeHtml(event.type === "rns" ? event.headline : "CrashDash alert")}</li>`).join("");
  const replayEpisodes = (story.alert_episodes || []).filter((episode) => episode.signal_count > 1).map((episode) => {
    const members = episodeMembers(episode, sources);
    const rows = members.map((member) => `<li data-replay-member data-member-date="${escapeHtml(String(member.signal_date || "").slice(0, 10))}" data-member-activity="${escapeHtml(member.relative_activity ?? "")}">${escapeHtml(shortStoryDate(member.signal_date))} · ${escapeHtml(member.watch_severity || "Severity unavailable")} · ${escapeHtml(member.signal_id || "Signal ID unavailable")}</li>`).join("");
    return `<li data-replay-episode data-replay-severity="${escapeHtml(episode.watch_severity || "Severity unavailable")}" data-replay-total="${episode.signal_count}" data-replay-start="${escapeHtml(episode.date)}"><strong data-replay-episode-summary>${escapeHtml(`${storyDateRange(episode.date, episode.end_date)} · ${episode.signal_count} alerts`)}</strong><ol>${rows}</ol></li>`;
  }).join("");
  const firstDate = (story.timeline || []).find((event) => event.date)?.date || story.as_of;
  const density = compact
    ? `<p class="current-story-density">${points.length} moments in this story</p>`
    : `<p class="current-story-density">Showing ${points.length} selected events from ${story.evidence_counts?.events || 0} retained evidence events.</p>`;
  return `<section class="current-catalyst-viewer${compact ? " current-catalyst-compact" : ""}" data-story-ticker="${escapeHtml(ticker)}" data-story-as-of="${escapeHtml(story.as_of)}" aria-labelledby="current-catalyst-heading"><div class="current-story-heading"><div><p class="eyebrow">Catalyst story · evidence through ${escapeHtml(story.as_of)}</p><h2 id="current-catalyst-heading">Catalyst Story</h2></div>${!compact ? `<span class="state-chip placeholder">${escapeHtml(story.status)} evidence</span>` : ""}</div><p class="current-story-summary">${escapeHtml(story.headline)}</p><div class="current-story-chronology" role="region" aria-label="Company story timeline" tabindex="0"><div class="current-story-track"><span class="current-story-past-label">Past</span><ol class="current-story-timeline" aria-label="Past company events">${timeline}<li class="current-story-now" aria-label="Current snapshot boundary"><span class="current-story-now-marker" aria-hidden="true"></span><span class="current-story-now-label">NOW</span><time>${escapeHtml(shortStoryDate(story.as_of))}</time></li></ol><div class="current-story-future${future.length ? " has-future-events" : ""}" aria-label="Future catalysts"><span>Future</span><i aria-hidden="true"></i>${futureContent}</div></div></div>${renderSelectedEvent(selected, sources, escapeHtml)}${density}<section class="current-story-snapshot"><p class="eyebrow">Story Snapshot</p><div><article><h3>What happened?</h3><p>${escapeHtml(story.snapshot?.happened || "No summary available.")}</p></article><article><h3>What changed?</h3><p>${escapeHtml(story.snapshot?.changed || "No further change is classified from the available evidence.")}</p></article><article><h3>What next?</h3><p>${escapeHtml(story.snapshot?.next || "No upcoming catalyst identified in this snapshot.")}</p></article></div></section><details class="current-story-evidence"><summary>View evidence</summary><p class="current-story-evidence-count">${story.evidence_counts?.events || 0} source records · ${story.evidence_counts?.alerts || 0} CrashDash alerts · ${story.evidence_counts?.rns || 0} company announcements</p><ul>${evidence}</ul></details><details class="current-story-replay"><summary>View full story &amp; replay</summary><label>Replay as of <input type="date" data-current-replay-date min="${escapeHtml(firstDate)}" max="${escapeHtml(story.as_of)}" value="${escapeHtml(story.as_of)}"></label><ol data-current-replay-events>${datedEvents}</ol>${replayEpisodes ? `<h3>Alert episodes at selected date</h3><ol data-current-replay-episodes>${replayEpisodes}</ol>` : ""}</details></section>`;
}

const storyRailPositions = new Map();
let activeStoryTicker = "";

export function bindCurrentCatalystReplay(root) {
  const renderedTicker = root.querySelector(".current-catalyst-viewer")?.dataset.storyTicker || "";
  if (renderedTicker && renderedTicker !== activeStoryTicker) {
    storyRailPositions.set(renderedTicker, { left: 0, moved: false });
    activeStoryTicker = renderedTicker;
  }
  const selectEvent = (button, { focus = false } = {}) => {
    const story = button.closest(".current-catalyst-viewer");
    if (!story) return;
    const events = [...story.querySelectorAll("[data-current-story-event]")];
    events.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    const detail = story.querySelector(".current-story-selected-event");
    if (detail) {
      const isEpisode = button.dataset.eventType === "episode";
      const isSignal = isEpisode || button.dataset.eventType === "signal";
      const semantic = isSignal ? `severity-${button.dataset.eventSeverityClass || "unavailable"}` : `sentiment-${button.dataset.eventSentiment || "unclassified"}`;
      detail.className = `current-story-selected-event event-${button.dataset.eventType} ${semantic}`;
      const date = detail.querySelector("[data-selected-event-date]");
      date.textContent = button.dataset.eventDate;
      date.dateTime = button.dataset.eventDateIso || "";
      detail.querySelector("[data-selected-event-title]").textContent = button.dataset.eventTitle;
      detail.querySelector("[data-selected-event-semantic]").textContent = button.dataset.eventSemantic;
      detail.querySelector("[data-selected-event-description]").textContent = button.dataset.eventDescription;
      const metrics = detail.querySelector("[data-selected-event-metrics]");
      metrics.replaceChildren();
      for (const metric of button.dataset.eventMetrics.split(" · ").filter(Boolean)) {
        const [label, value] = metric.split(": ");
        if (!label || !value) continue;
        const item = document.createElement("span");
        const valueNode = document.createElement("strong");
        item.append(document.createTextNode(`${label} `));
        valueNode.textContent = value;
        item.append(valueNode);
        metrics.append(item);
      }
      const action = detail.querySelector("[data-selected-event-action]");
      action.replaceChildren();
      if (isEpisode) {
        let members = [];
        try { members = JSON.parse(button.dataset.eventMembers || "[]"); } catch { members = []; }
        const expansion = createEpisodeExpansion(members);
        if (expansion) action.append(expansion);
      } else if (button.dataset.eventType === "rns") {
        const content = document.createElement("div");
        content.className = "current-story-rns-detail";
        const heading = document.createElement("h4");
        heading.textContent = "What happened";
        const summary = document.createElement("p");
        summary.textContent = button.dataset.eventRnsSummary || button.dataset.eventDescription;
        content.append(heading, summary);
        if (button.dataset.eventRnsPriceValue) {
          const price = document.createElement("p");
          price.className = "current-story-rns-price-context";
          price.textContent = `${button.dataset.eventRnsPriceLabel}: ${button.dataset.eventRnsPriceValue}`;
          content.append(price);
        }
        let keyPoints = [];
        try { keyPoints = JSON.parse(button.dataset.eventRnsPoints || "[]"); } catch { keyPoints = []; }
        if (Array.isArray(keyPoints) && keyPoints.length) {
          const section = document.createElement("section");
          section.className = "current-story-rns-key-points";
          const subheading = document.createElement("h4");
          subheading.textContent = "Key points";
          const list = document.createElement("ul");
          for (const point of keyPoints.slice(0, 4)) {
            const item = document.createElement("li");
            item.textContent = point;
            list.append(item);
          }
          section.append(subheading, list);
          content.append(section);
        }
        const full = cleanRnsPresentationText(button.dataset.eventRnsFull);
        if (full) {
          const disclosure = document.createElement("details");
          disclosure.className = "current-story-full-rns";
          const summaryLabel = document.createElement("summary");
          summaryLabel.textContent = "View full announcement";
          const body = document.createElement("pre");
          body.textContent = full;
          disclosure.append(summaryLabel, body);
          content.append(disclosure);
        }
        let sources = [];
        try { sources = JSON.parse(button.dataset.eventRnsSources || "[]"); } catch { sources = []; }
        if (Array.isArray(sources) && sources.length) {
          const provenance = document.createElement("div");
          provenance.className = "current-story-rns-provenance";
          const label = document.createElement("span");
          label.textContent = "Sources";
          provenance.append(label);
          for (const source of sources) {
            const url = safeExternalUrl(source.url);
            const link = url ? document.createElement("a") : document.createElement("span");
            if (url) { link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; }
            link.textContent = url ? `View source${sources.length > 1 ? ` (${source.name})` : ""} ↗` : source.name;
            provenance.append(link);
          }
          content.append(provenance);
        }
        action.append(content);
      } else if (safeExternalUrl(button.dataset.eventUrl)) {
        const href = safeExternalUrl(button.dataset.eventUrl);
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = button.dataset.eventType === "rns" ? "View source →" : "View evidence →";
        action.append(link);
      } else if (button.dataset.eventType === "signal") {
        const link = document.createElement("a");
        link.href = "#alert-history-heading";
        link.textContent = "View alert history ↓";
        action.append(link);
      }
    }
    const scroller = story.querySelector(".current-story-chronology");
    const marker = button.closest(".current-story-event");
    if (scroller && marker) {
      const markerRect = marker.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      const edgeRoom = Math.min(28, scroller.clientWidth * 0.08);
      const visibleLeft = scrollerRect.left + edgeRoom;
      const visibleRight = scrollerRect.right - edgeRoom;
      if (markerRect.left < visibleLeft || markerRect.right > visibleRight) {
        const left = scroller.scrollLeft + markerRect.left - scrollerRect.left - scroller.clientWidth / 2 + markerRect.width / 2;
        scroller.scrollTo({ left, behavior: storyScrollBehavior() });
      }
    }
    if (focus) button.focus({ preventScroll: true });
  };

  root.querySelectorAll("[data-current-story-event]").forEach((button) => {
    button.addEventListener("click", () => selectEvent(button));
  });
  root.querySelectorAll(".current-story-chronology").forEach((timeline) => {
    const story = timeline.closest(".current-catalyst-viewer");
    const ticker = story?.dataset.storyTicker || "";
    const maxScroll = () => Math.max(0, timeline.scrollWidth - timeline.clientWidth);
    const updateEdges = () => {
      timeline.classList.toggle("has-older-story", timeline.scrollLeft > 2);
      timeline.classList.toggle("has-newer-story", timeline.scrollLeft < maxScroll() - 2);
      const saved = storyRailPositions.get(ticker) || {};
      storyRailPositions.set(ticker, { ...saved, left: timeline.scrollLeft, moved: saved.moved || false });
    };
    requestAnimationFrame(() => {
      const saved = storyRailPositions.get(ticker);
      if (saved?.moved) {
        timeline.scrollLeft = Math.min(saved.left, maxScroll());
      } else {
        timeline.scrollLeft = maxScroll();
        const selectedEvent = timeline.querySelector('.current-story-timeline [data-current-story-event][aria-pressed="true"]')
          || timeline.querySelectorAll(".current-story-timeline .current-story-event").at(-1);
        if (selectedEvent) {
          const eventLeft = selectedEvent.getBoundingClientRect().left;
          const railLeft = timeline.getBoundingClientRect().left;
          const eventRight = selectedEvent.getBoundingClientRect().right;
          const railRight = timeline.getBoundingClientRect().right;
          if (eventLeft < railLeft || eventRight > railRight) timeline.scrollLeft = Math.max(0, Math.min(maxScroll(), timeline.scrollLeft + eventLeft - railLeft - timeline.clientWidth / 2 + selectedEvent.clientWidth / 2));
        }
      }
      updateEdges();
    });
    timeline.addEventListener("scroll", () => {
      const saved = storyRailPositions.get(ticker) || {};
      storyRailPositions.set(ticker, { ...saved, left: timeline.scrollLeft, moved: true });
      updateEdges();
    }, { passive: true });
    timeline.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || !maxScroll()) return;
      const delta = event.deltaY;
      const canMove = delta < 0 ? timeline.scrollLeft > 0 : timeline.scrollLeft < maxScroll();
      if (!canMove) return;
      event.preventDefault();
      timeline.scrollBy({ left: delta, behavior: "auto" });
    }, { passive: false });
    let drag = null;
    let suppressClickButton = null;
    timeline.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.isPrimary === false || event.pointerType !== "mouse") return;
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: timeline.scrollLeft,
        button: event.target.closest?.("button[data-current-story-event]") || null,
        active: false,
      };
    });
    timeline.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.active) {
        if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
        drag.active = true;
        timeline.classList.add("is-pointer-dragging");
        timeline.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      timeline.scrollLeft = drag.startScrollLeft - dx;
    });
    const finishPointerDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const completed = drag;
      drag = null;
      timeline.classList.remove("is-pointer-dragging");
      if (completed.active && completed.button) {
        suppressClickButton = completed.button;
        window.setTimeout(() => { suppressClickButton = null; }, 300);
      }
      if (timeline.hasPointerCapture?.(event.pointerId)) timeline.releasePointerCapture(event.pointerId);
    };
    timeline.addEventListener("pointerup", finishPointerDrag);
    timeline.addEventListener("pointercancel", finishPointerDrag);
    timeline.addEventListener("click", (event) => {
      if (!suppressClickButton || event.detail === 0) return;
      if (event.target.closest?.("button[data-current-story-event]") !== suppressClickButton) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickButton = null;
    }, true);
    timeline.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const events = [...timeline.querySelectorAll("[data-current-story-event]")];
      const selectedIndex = events.findIndex((item) => item.getAttribute("aria-pressed") === "true");
      const index = event.key === "Home" ? 0 : event.key === "End" ? events.length - 1
        : Math.max(0, Math.min(events.length - 1, selectedIndex + (event.key === "ArrowRight" ? 1 : -1)));
      if (!events[index]) return;
      event.preventDefault();
      selectEvent(events[index], { focus: true });
    });
  });
  root.querySelectorAll("[data-current-replay-date]").forEach((input) => {
    input.addEventListener("change", () => {
      const cutoff = input.value;
      input.closest(".current-story-replay")?.querySelectorAll("[data-event-date]").forEach((event) => {
        event.hidden = event.dataset.eventDate > cutoff;
      });
      input.closest(".current-story-replay")?.querySelectorAll("[data-replay-episode]").forEach((episode) => {
        const members = [...episode.querySelectorAll("[data-replay-member]")];
        const visible = members.filter((member) => member.dataset.memberDate <= cutoff);
        members.forEach((member) => { member.hidden = member.dataset.memberDate > cutoff; });
        episode.hidden = visible.length === 0;
        if (!visible.length) return;
        const activities = visible.map((member) => Number(member.dataset.memberActivity)).filter((value) => Number.isFinite(value) && value > 0);
        const start = visible[0].dataset.memberDate;
        const end = visible.at(-1).dataset.memberDate;
        const count = visible.length;
        const partial = count < Number(episode.dataset.replayTotal);
        const peak = activities.length ? ` · Peak activity ${Math.max(...activities)}×` : "";
        episode.querySelector("[data-replay-episode-summary]").textContent = `${storyDateRange(start, end)} · ${episode.dataset.replaySeverity} · ${count} alert${count === 1 ? "" : "s"}${partial ? " so far" : ""}${peak}`;
      });
      const story = input.closest(".current-catalyst-viewer");
      const timeline = story?.querySelector(".current-story-chronology");
      if (timeline && cutoff) {
        const eventList = timeline.querySelector(".current-story-timeline");
        const existingReplayBoundary = eventList?.querySelector(".current-story-replay-now");
        existingReplayBoundary?.remove();
        const realNowDate = story.dataset.storyAsOf || "";
        if (cutoff < realNowDate && eventList) {
          const events = [...timeline.querySelectorAll("[data-current-story-event]")];
          const replayNow = events.filter((event) => (event.dataset.eventDateIso || "") <= cutoff).at(-1);
          const replayBoundary = document.createElement("li");
          replayBoundary.className = "current-story-now current-story-replay-now";
          replayBoundary.setAttribute("aria-label", "Replay as-of boundary");
          const marker = document.createElement("span");
          marker.className = "current-story-now-marker";
          marker.setAttribute("aria-hidden", "true");
          const label = document.createElement("span");
          label.className = "current-story-now-label";
          label.textContent = "REPLAY NOW";
          const date = document.createElement("time");
          date.textContent = cutoff;
          replayBoundary.append(marker, label, date);
          if (replayNow) replayNow.closest(".current-story-event")?.after(replayBoundary);
          else eventList.prepend(replayBoundary);
          const boundaryRect = replayBoundary.getBoundingClientRect();
          const timelineRect = timeline.getBoundingClientRect();
          const left = timeline.scrollLeft + boundaryRect.left - timelineRect.left - timeline.clientWidth / 2 + boundaryRect.width / 2;
          timeline.scrollTo({ left, behavior: storyScrollBehavior() });
          timeline.dataset.replayNow = cutoff;
        } else {
          delete timeline.dataset.replayNow;
          const boundary = timeline.querySelector(".current-story-now:not(.current-story-replay-now)");
          if (boundary) {
            const boundaryRect = boundary.getBoundingClientRect();
            const timelineRect = timeline.getBoundingClientRect();
            const left = timeline.scrollLeft + boundaryRect.left - timelineRect.left - timeline.clientWidth / 2 + boundaryRect.width / 2;
            timeline.scrollTo({ left, behavior: storyScrollBehavior() });
          }
        }
      }
    });
  });
}
