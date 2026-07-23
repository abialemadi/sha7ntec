// ============================================================
// Sha7ntec — anomaly detection for sealed freight bids.
//
// Rules-based, NOT a trained model. The UI must label it
// "AI-assisted (rules-based)". These are pure functions so they can be
// unit-tested (see anomaly.test.ts) and run server-side at tender close.
//
// Rules (from the production spec §8.2):
//   High Outlier      z-score > 1.1 above the mean          -> review
//   Above Own History > 12% above the forwarder's avg bid   -> review
//   Lowball Risk      > 10% below the forwarder's avg bid   -> review
//   Unproven Vendor   forwarder total_bids < 5              -> review
//   Collusion Pattern two bids within 1.5% of each other    -> flagged
//
// Any flagged rule => severity 'flagged'. Any review rule => 'review'.
// Otherwise 'normal'.
// ============================================================

import type { AnomalyFlag, AnomalySeverity } from './types';

export const ANOMALY_THRESHOLDS = {
  outlierZScore: 1.1,
  aboveOwnHistoryPct: 0.12,
  lowballBelowOwnPct: 0.1,
  unprovenBidCount: 5,
  collusionWithinPct: 0.015,
} as const;

export interface AnomalyBidInput {
  bidId: string;
  forwarderId: string;
  amount: number;
  /** The forwarder's historical average bid amount (0 if unknown). */
  forwarderAvgBid: number;
  /** Total historical bids the forwarder has placed. */
  forwarderTotalBids: number;
}

export interface AnomalyResult {
  bidId: string;
  severity: AnomalySeverity;
  flags: AnomalyFlag[];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function escalate(current: AnomalySeverity, next: AnomalySeverity): AnomalySeverity {
  const rank: Record<AnomalySeverity, number> = { normal: 0, review: 1, flagged: 2 };
  return rank[next] > rank[current] ? next : current;
}

/**
 * Analyse every bid in a tender together (collusion is cross-bid).
 * Returns one result per input bid, in the same order.
 */
export function detectAnomalies(bids: AnomalyBidInput[]): AnomalyResult[] {
  const amounts = bids.map((b) => b.amount);
  const m = mean(amounts);
  const sd = stddev(amounts);

  // Pre-compute collusion: forwarder ids whose bid is within X% of another
  // (different) forwarder's bid.
  const colludingBidIds = new Set<string>();
  for (let i = 0; i < bids.length; i++) {
    for (let j = i + 1; j < bids.length; j++) {
      const a = bids[i];
      const b = bids[j];
      if (a.forwarderId === b.forwarderId) continue;
      const larger = Math.max(a.amount, b.amount);
      if (larger === 0) continue;
      const pctDiff = Math.abs(a.amount - b.amount) / larger;
      if (pctDiff <= ANOMALY_THRESHOLDS.collusionWithinPct) {
        colludingBidIds.add(a.bidId);
        colludingBidIds.add(b.bidId);
      }
    }
  }

  return bids.map((bid) => {
    const flags: AnomalyFlag[] = [];
    let severity: AnomalySeverity = 'normal';

    // High Outlier (only meaningful with variance and >= 3 bids)
    if (sd > 0 && bids.length >= 3) {
      const z = (bid.amount - m) / sd;
      if (z > ANOMALY_THRESHOLDS.outlierZScore) {
        flags.push({
          rule: 'high_outlier',
          message: `Bid is a high outlier (z-score ${z.toFixed(2)} above the field mean).`,
          severity: 'review',
        });
        severity = escalate(severity, 'review');
      }
    }

    // Above Own History
    if (bid.forwarderAvgBid > 0) {
      const overPct = (bid.amount - bid.forwarderAvgBid) / bid.forwarderAvgBid;
      if (overPct > ANOMALY_THRESHOLDS.aboveOwnHistoryPct) {
        flags.push({
          rule: 'above_own_history',
          message: `Bid is ${(overPct * 100).toFixed(1)}% above this forwarder's own average.`,
          severity: 'review',
        });
        severity = escalate(severity, 'review');
      }

      // Lowball Risk
      const belowPct = (bid.forwarderAvgBid - bid.amount) / bid.forwarderAvgBid;
      if (belowPct > ANOMALY_THRESHOLDS.lowballBelowOwnPct) {
        flags.push({
          rule: 'lowball_risk',
          message: `Bid is ${(belowPct * 100).toFixed(1)}% below this forwarder's own average — possible lowball.`,
          severity: 'review',
        });
        severity = escalate(severity, 'review');
      }
    }

    // Unproven Vendor
    if (bid.forwarderTotalBids < ANOMALY_THRESHOLDS.unprovenBidCount) {
      flags.push({
        rule: 'unproven_vendor',
        message: `Forwarder has only ${bid.forwarderTotalBids} prior bid(s) — limited track record.`,
        severity: 'review',
      });
      severity = escalate(severity, 'review');
    }

    // Collusion Pattern (flagged)
    if (colludingBidIds.has(bid.bidId)) {
      flags.push({
        rule: 'collusion_pattern',
        message: 'Bid is within 1.5% of another forwarder — possible collusion.',
        severity: 'flagged',
      });
      severity = escalate(severity, 'flagged');
    }

    return { bidId: bid.bidId, severity, flags };
  });
}

export interface AwardCandidate {
  bidId: string;
  forwarderId: string;
  amount: number;
  severity: AnomalySeverity;
}

export interface AwardRecommendation {
  recommendedBidId: string | null;
  cheapestBidId: string | null;
  cheapestBidSkipped: boolean;
  skipReason: string | null;
  savingsVsHighest: number;
}

/**
 * Recommend the lowest bid that is NOT flagged. If that skips the cheapest
 * bid (because the cheapest is flagged), record why.
 */
export function recommendAward(candidates: AwardCandidate[]): AwardRecommendation {
  if (candidates.length === 0) {
    return {
      recommendedBidId: null,
      cheapestBidId: null,
      cheapestBidSkipped: false,
      skipReason: null,
      savingsVsHighest: 0,
    };
  }

  const sorted = [...candidates].sort((a, b) => a.amount - b.amount);
  const cheapest = sorted[0];
  const highest = sorted[sorted.length - 1];

  const qualified = sorted.filter((c) => c.severity !== 'flagged');
  const recommended = qualified[0] ?? null;

  const cheapestBidSkipped =
    recommended !== null && recommended.bidId !== cheapest.bidId && cheapest.severity === 'flagged';

  return {
    recommendedBidId: recommended?.bidId ?? null,
    cheapestBidId: cheapest.bidId,
    cheapestBidSkipped,
    skipReason: cheapestBidSkipped
      ? 'Cheapest bid was flagged by anomaly detection and skipped for the lowest qualified bid.'
      : null,
    savingsVsHighest: recommended ? highest.amount - recommended.amount : 0,
  };
}
