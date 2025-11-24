/**
 * Calculates the Expected Value (EV%) of a bet.
 * EV% = ((Estimated Probability * Decimal Payout) - 1) * 100
 */
export const calculateEV = (confidence: number, odds: number): number => {
  const probability = confidence / 100;
  // Calculate Decimal Payout (Decimal Odds) from American Odds
  const decimalPayout = odds > 0
    ? (odds / 100) + 1
    : (100 / Math.abs(odds)) + 1;

  return ((probability * decimalPayout) - 1) * 100;
};

/**
 * Calculates the fair American line (no-vig odds) from confidence.
 */
export const calculateFairLine = (confidence: number): number => {
  const probability = confidence / 100;
  // Handle edge cases to prevent division by zero
  if (probability >= 1) return -Infinity;
  if (probability <= 0) return Infinity;

  if (probability > 0.5) {
    // Favorite
    return -Math.round((probability / (1 - probability)) * 100);
  } else {
    // Underdog
    return Math.round(((1 - probability) / probability) * 100);
  }
};
