/**
 * Grant Health Score — shared calculation utility
 * All score calculation logic lives here to avoid duplication.
 */

import { base44 } from "@/api/base44Client";
import { differenceInDays, parseISO } from "date-fns";

export const DEFAULT_WEIGHTS = {
  milestone_completion: 25,
  financial_utilization: 25,
  reporting_compliance: 20,
  document_completeness: 15,
  timeline_adherence: 15,
};

export const PARAM_LABELS = {
  milestone_completion: "Milestone Completion",
  financial_utilization: "Financial Utilization",
  reporting_compliance: "Reporting Compliance",
  document_completeness: "Document Completeness",
  timeline_adherence: "Timeline Adherence",
};

/** Load saved weightage config from DB, falling back to defaults. */
export async function loadWeightConfig() {
  const records = await base44.entities.GrantHealthScoreConfig.list();
  if (!records || records.length === 0) return { ...DEFAULT_WEIGHTS };
  const weights = { ...DEFAULT_WEIGHTS };
  records.forEach(r => {
    if (r.parameter_key && r.weightage != null) {
      weights[r.parameter_key] = r.weightage;
    }
  });
  return weights;
}

/** Classify score into Green / Amber / Red */
export function classifyScore(score) {
  if (score >= 80) return "Green";
  if (score >= 50) return "Amber";
  return "Red";
}

export function scoreColor(status) {
  if (status === "Green") return "text-green-600";
  if (status === "Amber") return "text-amber-500";
  return "text-red-600";
}

export function scoreBg(status) {
  if (status === "Green") return "bg-green-100 text-green-700";
  if (status === "Amber") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

/**
 * Calculate milestone completion score (0–100)
 */
function calcMilestoneScore(milestones) {
  if (!milestones || milestones.length === 0) return { score: null, reason: "No milestones configured." };
  const today = new Date();
  let completed = 0;
  let overdue = 0;
  milestones.forEach(m => {
    if (m.status === "paid" || m.status === "completed") completed++;
    else if (m.due_date && differenceInDays(parseISO(m.due_date), today) < 0) overdue++;
  });
  const total = milestones.length;
  // Overdue milestones reduce the score proportionally
  const rawScore = (completed / total) * 100;
  const penalty = (overdue / total) * 20; // each overdue costs up to 20 pts total
  const score = Math.max(0, Math.round(rawScore - penalty));
  const pct = Math.round((completed / total) * 100);
  let reason = `${pct}% of milestones completed (${completed}/${total}).`;
  if (overdue > 0) reason += ` ${overdue} milestone${overdue > 1 ? "s are" : " is"} overdue.`;
  return { score, reason };
}

/**
 * Calculate financial utilization score (0–100)
 */
function calcFinancialScore(grant, tranches) {
  const total = grant.total_amount || 0;
  if (!total) return { score: null, reason: "Financial data unavailable." };

  const received = (tranches || []).filter(t => t.status === "received").reduce((s, t) => s + (t.amount || 0), 0);
  if (total === 0) return { score: 50, reason: "No total grant amount set." };

  const utilizationRatio = received / total;
  // Ideal utilization: close to expected by timeline
  let score = 100;
  let reason = "";

  if (utilizationRatio > 1.05) {
    score = 20;
    reason = "Critical: Funds received exceed total grant amount.";
  } else if (utilizationRatio > 1.0) {
    score = 40;
    reason = "Warning: Funds received slightly exceed total grant amount.";
  } else if (utilizationRatio >= 0.75) {
    score = 100;
    reason = `Financial utilization is on track (${Math.round(utilizationRatio * 100)}% of grant received).`;
  } else if (utilizationRatio >= 0.5) {
    score = 75;
    reason = `Financial utilization is slightly below expected (${Math.round(utilizationRatio * 100)}% of grant received).`;
  } else if (utilizationRatio >= 0.25) {
    score = 50;
    reason = `Financial utilization is significantly below expected (${Math.round(utilizationRatio * 100)}% of grant received).`;
  } else {
    score = 30;
    reason = `Financial utilization is very low (${Math.round(utilizationRatio * 100)}% of grant received).`;
  }
  return { score, reason };
}

/**
 * Calculate reporting compliance score (0–100)
 */
function calcReportingScore(obligations) {
  if (!obligations || obligations.length === 0) return { score: null, reason: "No reporting obligations configured." };
  const today = new Date();
  let submitted = 0;
  let overdue = 0;
  obligations.forEach(o => {
    if (o.status === "Submitted" || o.status === "submitted") {
      submitted++;
    } else if (o.due_date && differenceInDays(parseISO(o.due_date), today) < 0) {
      overdue++;
    }
  });
  const total = obligations.length;
  const score = Math.max(0, Math.round(((submitted / total) * 100) - (overdue / total) * 30));
  let reason = `${submitted} of ${total} reporting obligations submitted.`;
  if (overdue > 0) reason += ` ${overdue} obligation${overdue > 1 ? "s are" : " is"} overdue.`;
  return { score, reason };
}

/**
 * Calculate document completeness score (0–100)
 */
function calcDocumentScore(uploadLogs) {
  if (!uploadLogs || uploadLogs.length === 0) return { score: null, reason: "No required document checklist configured." };
  const valid = uploadLogs.filter(d => !d.is_rejected && !d.is_invalid);
  const total = uploadLogs.length;
  const score = Math.round((valid.length / total) * 100);
  const missing = total - valid.length;
  let reason = `${valid.length} of ${total} required documents are valid and uploaded.`;
  if (missing > 0) reason += ` ${missing} document${missing > 1 ? "s are" : " is"} missing or invalid.`;
  return { score, reason };
}

/**
 * Calculate timeline adherence score (0–100)
 */
function calcTimelineScore(milestones, deliverables) {
  const items = [...(milestones || []), ...(deliverables || [])];
  if (items.length === 0) return { score: null, reason: "No timeline items configured." };
  const today = new Date();
  let onTime = 0;
  let overdue = 0;
  items.forEach(item => {
    if (!item.due_date) return;
    const isPaid = item.status === "paid" || item.status === "completed";
    const daysLeft = differenceInDays(parseISO(item.due_date), today);
    if (isPaid) {
      onTime++;
    } else if (daysLeft < 0) {
      overdue++;
    } else {
      onTime++;
    }
  });
  const valid = items.filter(i => i.due_date).length;
  if (valid === 0) return { score: null, reason: "No dated timeline items configured." };
  const score = Math.max(0, Math.round((onTime / valid) * 100) - (overdue / valid) * 10);
  let reason = `${onTime} of ${valid} timeline items are on track.`;
  if (overdue > 0) reason += ` ${overdue} item${overdue > 1 ? "s are" : " is"} overdue.`;
  return { score, reason };
}

/**
 * Full grant health score calculation.
 * @param {object} grant
 * @param {object} data  { milestones, tranches, obligations, uploadLogs, deliverables }
 * @param {object} weights  e.g. { milestone_completion: 25, ... }
 * @returns {object} full score breakdown
 */
export function calculateGrantHealthScore(grant, data, weights) {
  const w = weights || DEFAULT_WEIGHTS;

  const milestoneResult = calcMilestoneScore(data.milestones);
  const financialResult = calcFinancialScore(grant, data.tranches);
  const reportingResult = calcReportingScore(data.obligations);
  const documentResult = calcDocumentScore(data.uploadLogs);
  const timelineResult = calcTimelineScore(data.milestones, data.deliverables);

  // Use 50 as neutral score when data is missing (to not unfairly penalize)
  const ms = milestoneResult.score ?? 50;
  const fs = financialResult.score ?? 50;
  const rs = reportingResult.score ?? 50;
  const ds = documentResult.score ?? 50;
  const ts = timelineResult.score ?? 50;

  const mw = w.milestone_completion / 100;
  const fw = w.financial_utilization / 100;
  const rw = w.reporting_compliance / 100;
  const dw = w.document_completeness / 100;
  const tw = w.timeline_adherence / 100;

  const mWeighted = parseFloat((ms * mw).toFixed(2));
  const fWeighted = parseFloat((fs * fw).toFixed(2));
  const rWeighted = parseFloat((rs * rw).toFixed(2));
  const dWeighted = parseFloat((ds * dw).toFixed(2));
  const tWeighted = parseFloat((ts * tw).toFixed(2));

  const overall = parseFloat((mWeighted + fWeighted + rWeighted + dWeighted + tWeighted).toFixed(1));
  const status = classifyScore(overall);

  const reasons = [
    milestoneResult.reason,
    financialResult.reason,
    reportingResult.reason,
    documentResult.reason,
    timelineResult.reason,
  ].filter(Boolean);

  return {
    milestone_score: ms,
    financial_score: fs,
    reporting_score: rs,
    document_score: ds,
    timeline_score: ts,
    milestone_weightage: w.milestone_completion,
    financial_weightage: w.financial_utilization,
    reporting_weightage: w.reporting_compliance,
    document_weightage: w.document_completeness,
    timeline_weightage: w.timeline_adherence,
    milestone_weighted_score: mWeighted,
    financial_weighted_score: fWeighted,
    reporting_weighted_score: rWeighted,
    document_weighted_score: dWeighted,
    timeline_weighted_score: tWeighted,
    overall_score: overall,
    health_status: status,
    reasons,
    // raw null flags for UI messages
    _missing: {
      milestones: milestoneResult.score === null,
      financial: financialResult.score === null,
      reporting: reportingResult.score === null,
      documents: documentResult.score === null,
      timeline: timelineResult.score === null,
    }
  };
}