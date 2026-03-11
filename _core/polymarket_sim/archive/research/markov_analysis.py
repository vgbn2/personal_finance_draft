
"""
Markov Chain Analysis for Market Regime Detection.
Calculates transition probabilities between price states (Up, Down, Flat).
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple

class MarkovAnalyzer:
    def __init__(self, price_series: List[float], threshold: float = 0.001):
        """
        Args:
            price_series: List of prices (e.g. mid prices)
            threshold: Minimum change to be considered Up/Down (avoid noise)
        """
        self.prices = np.array(price_series)
        self.threshold = threshold
        self.transitions = {}
        self.probs = {}

    def _get_state(self, change: float) -> str:
        if change > self.threshold:
            return "U" # Up
        elif change < -self.threshold:
            return "D" # Down
        else:
            return "F" # Flat

    def analyze(self) -> Dict[str, Dict[str, float]]:
        """
        Builds the transition matrix.
        Returns likelihood of next state given current state.
        e.g. {'U': {'U': 0.6, 'D': 0.4}, ...}
        """
        changes = np.diff(self.prices)
        states = [self._get_state(c) for c in changes]

        # Count transitions
        # Matrix: Current -> Next
        counts = {"U": {"U": 0, "D": 0, "F": 0},
                  "D": {"U": 0, "D": 0, "F": 0},
                  "F": {"U": 0, "D": 0, "F": 0}}

        for i in range(len(states) - 1):
            current = states[i]
            next_s = states[i+1]
            counts[current][next_s] += 1

        # Calculate probabilities
        self.probs = {}
        for current_state, transitions in counts.items():
            total = sum(transitions.values())
            if total > 0:
                self.probs[current_state] = {
                    k: v / total for k, v in transitions.items()
                }
            else:
                self.probs[current_state] = {"U": 0, "D": 0, "F": 0}

        return self.probs

    def get_regime(self) -> str:
        """
        Classify market regime based on probabilities.
        """
        if not self.probs:
            self.analyze()
        
        # Persistence: P(U|U) + P(D|D)
        persistence = self.probs.get("U", {}).get("U", 0) + self.probs.get("D", {}).get("D", 0)
        # Reversal: P(D|U) + P(U|D)
        reversal = self.probs.get("U", {}).get("D", 0) + self.probs.get("D", {}).get("U", 0)
        
        # Normalize (rough heuristic)
        score = persistence - reversal
        
        if score > 0.1:
            return "Trending"
        elif score < -0.1:
            return "Mean Reverting"
        else:
            return "Random Walk / Noise"

if __name__ == "__main__":
    # Example Usage
    dummy_prices = [0.50, 0.51, 0.52, 0.53, 0.52, 0.51, 0.50, 0.49, 0.50, 0.51]
    analyzer = MarkovAnalyzer(dummy_prices)
    print("Transition Matrix:", analyzer.analyze())
    print("Regime:", analyzer.get_regime())
