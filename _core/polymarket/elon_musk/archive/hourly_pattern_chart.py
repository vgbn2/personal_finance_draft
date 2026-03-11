"""
Elon Tweet Hourly Pattern Visualization

Generates a moving average chart of tweet frequency by hour of day.
X-axis: Hour (00-23)
Y-axis: Average tweets per hour
"""

import matplotlib.pyplot as plt
import numpy as np
from datetime import datetime, timedelta
import sys
import os

# Add parent dir for imports
sys.path.insert(0, os.path.dirname(__file__))
from elonmusk_tweet import Config


def generate_hourly_profile_chart():
    """Generate chart based on HOURLY_PROFILE configuration."""
    
    hours = list(range(24))
    rates = [Config.HOURLY_PROFILE[h]['rate'] for h in hours]
    labels = [Config.HOURLY_PROFILE[h]['label'] for h in hours]
    alphas = [Config.HOURLY_PROFILE[h]['alpha'] for h in hours]
    
    # Calculate expected tweets per hour (BASE_RATE / 24 * rate_multiplier)
    base_hourly = Config.BASE_RATE / 24
    tweets_per_hour = [base_hourly * r for r in rates]
    
    # Create figure
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10), sharex=True)
    
    # Color mapping by phase
    colors = []
    for h in hours:
        label = Config.HOURLY_PROFILE[h]['label']
        if 'MANIC' in label:
            colors.append('#ff4444')  # Red
        elif 'ACTIVE' in label:
            colors.append('#ff9944')  # Orange
        elif 'SLEEP' in label:
            colors.append('#4444ff')  # Blue
        elif 'WAKE' in label:
            colors.append('#44ff44')  # Green
        else:
            colors.append('#888888')  # Gray
    
    # Plot 1: Tweets per hour
    ax1.bar(hours, tweets_per_hour, color=colors, alpha=0.7, edgecolor='black')
    ax1.axhline(y=base_hourly, color='red', linestyle='--', label=f'Base ({base_hourly:.2f}/hr)')
    
    # Moving average (3-hour window)
    window = 3
    ma = np.convolve(tweets_per_hour, np.ones(window)/window, mode='same')
    ax1.plot(hours, ma, color='black', linewidth=2, marker='o', label=f'{window}-Hour MA')
    
    ax1.set_ylabel('Expected Tweets/Hour', fontsize=12)
    ax1.set_title("Elon Musk Tweet Pattern by Hour (UTC+7)", fontsize=14, fontweight='bold')
    ax1.legend(loc='upper right')
    ax1.grid(axis='y', alpha=0.3)
    ax1.set_ylim(0, max(tweets_per_hour) * 1.2)
    
    # Add phase labels
    phase_changes = []
    current_label = labels[0]
    for i, label in enumerate(labels):
        if label != current_label:
            phase_changes.append((i, current_label))
            current_label = label
    phase_changes.append((24, current_label))
    
    # Plot 2: Rate Multiplier
    ax2.bar(hours, rates, color=colors, alpha=0.7, edgecolor='black')
    ax2.axhline(y=1.0, color='red', linestyle='--', label='Baseline (1.0)')
    
    # MA for rates
    rate_ma = np.convolve(rates, np.ones(window)/window, mode='same')
    ax2.plot(hours, rate_ma, color='black', linewidth=2, marker='o', label=f'{window}-Hour MA')
    
    ax2.set_xlabel('Hour (UTC+7)', fontsize=12)
    ax2.set_ylabel('Rate Multiplier', fontsize=12)
    ax2.set_title("Rate Multiplier by Hour", fontsize=14)
    ax2.legend(loc='upper right')
    ax2.grid(axis='y', alpha=0.3)
    ax2.set_xticks(hours)
    ax2.set_xticklabels([f'{h:02d}' for h in hours], rotation=45)
    
    # Add phase annotations
    prev_h = 0
    for h, label in phase_changes:
        mid = (prev_h + h) / 2
        short_label = label.split()[-1] if label else ''
        ax2.annotate(short_label, xy=(mid, max(rates) * 0.9), 
                    ha='center', fontsize=9, alpha=0.7)
        prev_h = h
    
    plt.tight_layout()
    
    # Save to file
    output_path = os.path.join(os.path.dirname(__file__), 'hourly_pattern.png')
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"✅ Saved chart to: {output_path}")
    
    # Also show
    plt.show()
    
    return output_path


def print_summary_table():
    """Print a text summary of the hourly pattern."""
    print("\n📊 HOURLY PROFILE SUMMARY (UTC+7)")
    print("=" * 60)
    print(f"{'Hour':<6} {'Phase':<12} {'Rate':<8} {'Alpha':<8} {'Tweets/Hr':<10}")
    print("-" * 60)
    
    base_hourly = Config.BASE_RATE / 24
    
    for h in range(24):
        prof = Config.HOURLY_PROFILE[h]
        tweets = base_hourly * prof['rate']
        phase = prof['label'].split()[-1]
        print(f"{h:02d}:00  {phase:<12} {prof['rate']:<8.2f} {prof['alpha']:<8.2f} {tweets:<10.2f}")
    
    print("=" * 60)
    print(f"Daily Total: {Config.BASE_RATE:.1f} tweets")


if __name__ == '__main__':
    print_summary_table()
    
    try:
        generate_hourly_profile_chart()
    except ImportError as e:
        print(f"\n⚠️ matplotlib not installed. Install with: pip install matplotlib")
        print("Table output shown above.")
