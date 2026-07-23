import { describe, it, expect } from 'vitest';
import { detectAnomalies, recommendAward, type AnomalyBidInput } from './anomaly';

function baseBid(over: Partial<AnomalyBidInput> & { bidId: string; amount: number }): AnomalyBidInput {
  return {
    forwarderId: over.forwarderId ?? over.bidId,
    forwarderAvgBid: over.forwarderAvgBid ?? 0,
    forwarderTotalBids: over.forwarderTotalBids ?? 10,
    ...over,
  };
}

describe('detectAnomalies', () => {
  it('returns normal for a lone, established, on-history bid', () => {
    // With <3 bids the high-outlier rule does not apply, and a proven
    // forwarder bidding at its own average trips nothing.
    const res = detectAnomalies([
      baseBid({ bidId: 'a', forwarderId: 'fa', amount: 1000, forwarderAvgBid: 1000, forwarderTotalBids: 20 }),
    ]);
    expect(res[0].severity).toBe('normal');
    expect(res[0].flags).toHaveLength(0);
  });

  it('leaves the low and mid bids of a spread field un-flagged (only the top reviews)', () => {
    // A realistic, well-spaced field: no collusion, and only the highest bid
    // crosses the outlier threshold. Nothing should be "flagged".
    const bids = [
      baseBid({ bidId: 'a', forwarderId: 'fa', amount: 1000, forwarderAvgBid: 1000, forwarderTotalBids: 20 }),
      baseBid({ bidId: 'b', forwarderId: 'fb', amount: 1100, forwarderAvgBid: 1100, forwarderTotalBids: 20 }),
      baseBid({ bidId: 'c', forwarderId: 'fc', amount: 1200, forwarderAvgBid: 1200, forwarderTotalBids: 20 }),
    ];
    const res = detectAnomalies(bids);
    expect(res.every((r) => r.severity !== 'flagged')).toBe(true);
    expect(res.find((r) => r.bidId === 'a')!.severity).toBe('normal');
  });

  it('flags collusion when two different forwarders bid within 1.5%', () => {
    const bids = [
      baseBid({ bidId: 'a', forwarderId: 'fa', amount: 1000, forwarderAvgBid: 1000, forwarderTotalBids: 20 }),
      baseBid({ bidId: 'b', forwarderId: 'fb', amount: 1010, forwarderAvgBid: 1010, forwarderTotalBids: 20 }),
      baseBid({ bidId: 'c', forwarderId: 'fc', amount: 1500, forwarderAvgBid: 1500, forwarderTotalBids: 20 }),
    ];
    const res = detectAnomalies(bids);
    const a = res.find((r) => r.bidId === 'a')!;
    const b = res.find((r) => r.bidId === 'b')!;
    const c = res.find((r) => r.bidId === 'c')!;
    expect(a.severity).toBe('flagged');
    expect(b.severity).toBe('flagged');
    expect(a.flags.some((f) => f.rule === 'collusion_pattern')).toBe(true);
    // c is far away — not collusion (but may be a high outlier)
    expect(c.flags.some((f) => f.rule === 'collusion_pattern')).toBe(false);
  });

  it('does not treat one forwarder amending near their own value as collusion', () => {
    // Same forwarder id excluded from collusion pairing.
    const bids = [
      baseBid({ bidId: 'a', forwarderId: 'same', amount: 1000, forwarderAvgBid: 1000, forwarderTotalBids: 20 }),
      baseBid({ bidId: 'b', forwarderId: 'same', amount: 1005, forwarderAvgBid: 1005, forwarderTotalBids: 20 }),
    ];
    const res = detectAnomalies(bids);
    expect(res.every((r) => !r.flags.some((f) => f.rule === 'collusion_pattern'))).toBe(true);
  });

  it('marks review for a high outlier', () => {
    const bids = [
      baseBid({ bidId: 'a', forwarderId: 'fa', amount: 1000, forwarderAvgBid: 1000, forwarderTotalBids: 20 }),
      baseBid({ bidId: 'b', forwarderId: 'fb', amount: 1000, forwarderAvgBid: 1000, forwarderTotalBids: 20 }),
      baseBid({ bidId: 'c', forwarderId: 'fc', amount: 3000, forwarderAvgBid: 3000, forwarderTotalBids: 20 }),
    ];
    const res = detectAnomalies(bids);
    const c = res.find((r) => r.bidId === 'c')!;
    expect(c.severity).toBe('review');
    expect(c.flags.some((f) => f.rule === 'high_outlier')).toBe(true);
  });

  it('marks review when above own history by >12%', () => {
    const bids = [
      baseBid({ bidId: 'a', forwarderId: 'fa', amount: 1500, forwarderAvgBid: 1000, forwarderTotalBids: 20 }),
    ];
    const res = detectAnomalies(bids);
    expect(res[0].flags.some((f) => f.rule === 'above_own_history')).toBe(true);
    expect(res[0].severity).toBe('review');
  });

  it('marks review for lowball (>10% below own average)', () => {
    const bids = [
      baseBid({ bidId: 'a', forwarderId: 'fa', amount: 800, forwarderAvgBid: 1000, forwarderTotalBids: 20 }),
    ];
    const res = detectAnomalies(bids);
    expect(res[0].flags.some((f) => f.rule === 'lowball_risk')).toBe(true);
  });

  it('marks review for an unproven forwarder (<5 prior bids)', () => {
    const bids = [
      baseBid({ bidId: 'a', forwarderId: 'fa', amount: 1000, forwarderAvgBid: 1000, forwarderTotalBids: 2 }),
    ];
    const res = detectAnomalies(bids);
    expect(res[0].flags.some((f) => f.rule === 'unproven_vendor')).toBe(true);
    expect(res[0].severity).toBe('review');
  });

  it('flagged wins over review when both apply', () => {
    const bids = [
      baseBid({ bidId: 'a', forwarderId: 'fa', amount: 1000, forwarderAvgBid: 1000, forwarderTotalBids: 2 }),
      baseBid({ bidId: 'b', forwarderId: 'fb', amount: 1010, forwarderAvgBid: 1010, forwarderTotalBids: 2 }),
    ];
    const res = detectAnomalies(bids);
    // both unproven (review) AND colluding (flagged) => flagged
    expect(res.every((r) => r.severity === 'flagged')).toBe(true);
  });
});

describe('recommendAward', () => {
  it('recommends the lowest bid when none are flagged', () => {
    const rec = recommendAward([
      { bidId: 'a', forwarderId: 'fa', amount: 1200, severity: 'normal' },
      { bidId: 'b', forwarderId: 'fb', amount: 1000, severity: 'review' },
      { bidId: 'c', forwarderId: 'fc', amount: 1500, severity: 'normal' },
    ]);
    expect(rec.recommendedBidId).toBe('b');
    expect(rec.cheapestBidSkipped).toBe(false);
    expect(rec.savingsVsHighest).toBe(500);
  });

  it('skips the cheapest bid when it is flagged', () => {
    const rec = recommendAward([
      { bidId: 'a', forwarderId: 'fa', amount: 900, severity: 'flagged' },
      { bidId: 'b', forwarderId: 'fb', amount: 1000, severity: 'normal' },
      { bidId: 'c', forwarderId: 'fc', amount: 1500, severity: 'normal' },
    ]);
    expect(rec.recommendedBidId).toBe('b');
    expect(rec.cheapestBidId).toBe('a');
    expect(rec.cheapestBidSkipped).toBe(true);
    expect(rec.skipReason).toBeTruthy();
  });

  it('returns null recommendation when every bid is flagged', () => {
    const rec = recommendAward([
      { bidId: 'a', forwarderId: 'fa', amount: 900, severity: 'flagged' },
      { bidId: 'b', forwarderId: 'fb', amount: 1000, severity: 'flagged' },
    ]);
    expect(rec.recommendedBidId).toBeNull();
  });

  it('handles an empty field', () => {
    const rec = recommendAward([]);
    expect(rec.recommendedBidId).toBeNull();
    expect(rec.cheapestBidId).toBeNull();
  });
});
