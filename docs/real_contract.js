import { loadBundle } from "./browser.js?v=20261017T162124Z";

const MONTH_INDEX = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Announcement dates arrive as ISO, as "15 Oct 2026", or as a timestamp.
 *
 *  The chart places markers by comparing dates as strings against the price
 *  series, which is always ISO. An un-normalised "15 Oct 2026" can never fall
 *  inside an ISO window, so announcements were silently dropped from the chart
 *  even though they were present in the payload.
 */
export function isoDate(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const human = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(text);
  if (human) {
    const month = MONTH_INDEX[human[2].slice(0, 3).toLowerCase()];
    if (month) {
      return `${human[3]}-${String(month).padStart(2, "0")}-${human[1].padStart(2, "0")}`;
    }
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function normaliseRealBundle(beginnerPayload, proPayload) {
  return {
    beginner: loadBundle(beginnerPayload),
    pro: loadBundle(proPayload),
  };
}

export function normaliseDashboard(payload) {
  const dashboard = loadBundle(payload);
  if (!Array.isArray(dashboard.records) || !dashboard.details || typeof dashboard.details !== "object") {
    throw new Error("invalid current-signal dashboard contract");
  }
  return dashboard;
}

// A dashboard `details` entry is not necessarily a full instrument contract: it
// may be a lightweight index reference (or an empty object) with no detail_path.
// Feeding such a value to normaliseInstrumentDetail throws and takes the entire
// list view down with it, so callers must be able to tell the two apart.
// Per-instrument detail payloads are optional, so anything that is not a genuine
// contract must fail closed to NOT_AVAILABLE rather than crash.
export function isInstrumentContractPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.web_schema === "WEB_V1") {
    return Boolean(value.common && value.beginner && value.pro);
  }
  if (value.web_schema !== undefined) return false;
  return Boolean(value.beginner && value.pro);
}

// WEB_V1 keeps large common fields once on the wire. Both view models reuse
// them in memory; legacy backend/preview bundles retain their existing support.
export function normaliseInstrumentDetail(detail, record = null) {
  if (detail.web_schema !== undefined && detail.web_schema !== "WEB_V1") {
    throw new Error("unsupported instrument web schema");
  }
  if (detail.web_schema === "WEB_V1") {
    if (!detail.common || !detail.beginner || !detail.pro) {
      throw new Error("incomplete instrument web contract");
    }
    const common = detail.common;
    const profile = common.profile ? { ...common.profile } : null;
    if (profile?.rns && detail.instrument_detail) {
      profile.rns = { ...profile.rns, records: (detail.instrument_detail.rns || []).map(({ profile_date, ...rns }) => (
        profile_date === undefined ? rns : { ...rns, date: profile_date }
      )) };
    }
    const shared = { ...common, ...(profile ? { profile } : {}) };
    detail = { ...detail, beginner: { ...shared, ...detail.beginner }, pro: { ...shared, ...detail.pro } };
  }
  const bundle = normaliseRealBundle({ schema_version: "V1", data: detail.beginner }, { schema_version: "V1", data: detail.pro });
  const instrument = detail.instrument_detail;
  if (instrument && typeof instrument === "object") {
    const metadata = instrument.company_metadata || instrument.identity || {};
    const priceSeries = Array.isArray(instrument.price_series) ? instrument.price_series : [];
    const alerts = [
      ...(Array.isArray(instrument.current_alerts) ? instrument.current_alerts : []).map((alert) => ({ ...alert, current: true })),
      ...(Array.isArray(instrument.historical_alerts) ? instrument.historical_alerts : []).map((alert) => ({ ...alert, current: false })),
    ].map((alert) => ({
      ...alert,
      event_type: alert.event_type || alert.marker_type || "CRASHDASH_SIGNAL",
      marker_type: alert.marker_type || alert.event_type || "CRASHDASH_SIGNAL",
      severity: alert.severity || alert.watch_severity,
      signal_type: alert.signal_type || alert.signal_state,
      accumulation: alert.accumulation === "DETECTED" || alert.accumulation === true,
    }));
    const rns = (Array.isArray(instrument.rns) ? instrument.rns : []).map((record) => {
      const normalised = isoDate(record && record.date);
      // Keep what the payload said for display, and give the chart a comparable key.
      return normalised ? { ...record, display_date: record.date, date: normalised } : { ...record };
    });
    const initialSharechat = Array.isArray(instrument.sharechat_initial)
      ? instrument.sharechat_initial : (instrument.sharechat || []).slice(0, 10);
    for (const model of [bundle.beginner, bundle.pro]) {
      const local = model.local_enrichment && typeof model.local_enrichment === "object"
        ? model.local_enrichment : {};
      model.local_enrichment = {
        ...local,
        metadata: { ...(local.metadata || {}), ...metadata },
        price_history: priceSeries,
        convergence: {
          ...(local.convergence || {}),
          price_points: priceSeries,
          alert_markers: alerts,
          rns_markers: rns,
        },
      };
      model.rns_total_available = instrument.rns_total_available
        ?? instrument.profile?.rns?.total_available
        ?? rns.length;
      model.social_records = initialSharechat;
      model.sharechat_snapshot = instrument.sharechat_snapshot || null;
      if (model.sharechat_snapshot) {
        model.sharechat_total_available = model.sharechat_snapshot.total_posts;
        model.social_status = model.sharechat_snapshot.analysis_status;
      }
      model.corporate_actions = instrument.corporate_actions || null;
      model.ai_analysis = instrument.research?.data || model.ai_analysis;
      model.ai_status = instrument.research?.status || model.ai_status;
      const summary = instrument.company_summary;
      if (summary && (summary.what_they_do || summary.why_it_matters || summary.current_state)) {
        model.research_brief = {
          validation_state: "VALIDATED",
          quick_read: Object.fromEntries(["what_they_do", "why_it_matters", "current_state"].map((key) => [
            key, { text: summary[key], evidence_refs: [] },
          ])),
        };
      }
    }
  }
  bundle.beginner.signal_date = record?.signal_date;
  bundle.pro.signal_date = record?.signal_date;
  return bundle;
}
