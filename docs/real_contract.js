import { loadBundle } from "./browser.js";

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
    const rns = Array.isArray(instrument.rns) ? instrument.rns : [];
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
