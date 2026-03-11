"""
Unit Tests for Elon Tweet Tracker

Run with: pytest test_elonmusk_tweet.py -v
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

# Import the module under test
from elonmusk_tweet import (
    Config,
    TweetAnalyzer,
    ProfileEntry,
    Bucket,
    TrackerError,
    BrowserLaunchError,
    DataParseError,
    APIError,
    Signal,
    SchedulePhase,
)


# ==========================================
# 🧪 CONFIG TESTS
# ==========================================

class TestConfig:
    """Test configuration validation."""
    
    def test_hourly_profile_completeness(self):
        """Verify all 24 hours are covered."""
        assert len(Config.HOURLY_PROFILE) == 24
        for h in range(24):
            assert h in Config.HOURLY_PROFILE
    
    def test_hourly_profile_keys(self):
        """Verify profile entries have required keys."""
        for h, entry in Config.HOURLY_PROFILE.items():
            assert 'rate' in entry
            assert 'alpha' in entry
            assert 'label' in entry
    
    def test_rate_bounds(self):
        """Verify rate multipliers are positive."""
        for h, entry in Config.HOURLY_PROFILE.items():
            assert entry['rate'] >= 0.0
    
    def test_alpha_bounds(self):
        """Verify alpha values are positive."""
        for h, entry in Config.HOURLY_PROFILE.items():
            assert entry['alpha'] >= 0.0


# ==========================================
# 🧪 TWEET ANALYZER TESTS
# ==========================================

class TestTweetAnalyzer:
    """Test statistical calculations."""
    
    def test_get_local_hour_returns_int(self):
        """Verify get_local_hour returns an integer."""
        result = TweetAnalyzer.get_local_hour()
        assert isinstance(result, int)
        assert 0 <= result <= 23
    
    def test_get_schedule_status_returns_tuple(self):
        """Verify get_schedule_status returns expected format."""
        rate, label, hour = TweetAnalyzer.get_schedule_status()
        assert isinstance(rate, float)
        assert isinstance(label, str)
        assert isinstance(hour, int)
    
    def test_calculate_dynamic_rate_with_valid_data(self):
        """Test dynamic rate with valid tracker data."""
        tracker_data = [
            {'count': 100, 'label': 'This Week'},
            {'count': 385, 'label': 'Last Week'},  # 385/7 = 55
        ]
        result = TweetAnalyzer.calculate_dynamic_rate(tracker_data)
        assert result == 55.0
    
    def test_calculate_dynamic_rate_with_empty_data(self):
        """Test dynamic rate falls back with empty data."""
        result = TweetAnalyzer.calculate_dynamic_rate([])
        assert result == Config.BASE_RATE
    
    def test_calculate_dynamic_rate_with_none(self):
        """Test dynamic rate falls back with None."""
        result = TweetAnalyzer.calculate_dynamic_rate(None)
        assert result == Config.BASE_RATE
    
    def test_calculate_dynamic_rate_with_invalid_count(self):
        """Test dynamic rate falls back with invalid count."""
        tracker_data = [
            {'count': 100},
            {'count': -10},  # Invalid negative
        ]
        result = TweetAnalyzer.calculate_dynamic_rate(tracker_data)
        assert result == Config.BASE_RATE
    
    def test_calculate_nbinom_prob_zero_mu(self):
        """Test NBinom returns 0 for zero mean."""
        result = TweetAnalyzer.calculate_nbinom_prob(0, 10, 0.0, 5.0)
        assert result == 0.0
    
    def test_calculate_nbinom_prob_valid_range(self):
        """Test NBinom returns valid probability range."""
        result = TweetAnalyzer.calculate_nbinom_prob(50, 60, 55.0, 5.0)
        assert 0.0 <= result <= 100.0
    
    def test_calculate_poisson_prob_zero_mu(self):
        """Test Poisson returns 0 for zero mean."""
        result = TweetAnalyzer.calculate_poisson_prob(0, 10, 0.0)
        assert result == 0.0
    
    def test_calculate_poisson_prob_valid_range(self):
        """Test Poisson returns valid probability range."""
        result = TweetAnalyzer.calculate_poisson_prob(50, 60, 55.0)
        assert 0.0 <= result <= 100.0
    
    def test_calculate_kelly_zero_prob(self):
        """Test Kelly returns zero for zero probability."""
        frac, amount, reason = TweetAnalyzer.calculate_kelly(0.0, 50.0, 100, 200, 5.0)
        assert frac == 0.0
        assert amount == 0.0
        assert reason == "N/A"
    
    def test_calculate_kelly_negative_ev(self):
        """Test Kelly returns zero for negative EV."""
        # Low prob (10%), high price (90 cents) = negative EV
        frac, amount, reason = TweetAnalyzer.calculate_kelly(10.0, 90.0, 100, 200, 5.0)
        assert frac == 0.0
        assert reason == "NegEV"
    
    def test_calculate_kelly_positive_ev(self):
        """Test Kelly returns positive for positive EV."""
        # High prob (80%), low price (20 cents) = positive EV
        frac, amount, reason = TweetAnalyzer.calculate_kelly(80.0, 20.0, 100, 200, 5.0)
        assert frac > 0.0
        assert amount > 0.0
        assert reason == "OK"
    
    def test_integrate_schedule_zero_days(self):
        """Test integrate_schedule with zero days left."""
        proj, alpha = TweetAnalyzer.integrate_schedule(55.0, 0.0)
        assert proj == 0.0
        assert alpha == 1.0
    
    def test_integrate_schedule_positive_days(self):
        """Test integrate_schedule with positive days."""
        proj, alpha = TweetAnalyzer.integrate_schedule(55.0, 1.0)
        assert proj > 0.0
        assert alpha > 0.0


# ==========================================
# 🧪 EXCEPTION TESTS
# ==========================================

class TestExceptions:
    """Test custom exception hierarchy."""
    
    def test_tracker_error_is_exception(self):
        """Verify TrackerError is an Exception."""
        assert issubclass(TrackerError, Exception)
    
    def test_browser_launch_error_inheritance(self):
        """Verify BrowserLaunchError inherits from TrackerError."""
        assert issubclass(BrowserLaunchError, TrackerError)
    
    def test_data_parse_error_inheritance(self):
        """Verify DataParseError inherits from TrackerError."""
        assert issubclass(DataParseError, TrackerError)
    
    def test_api_error_inheritance(self):
        """Verify APIError inherits from TrackerError."""
        assert issubclass(APIError, TrackerError)


# ==========================================
# 🧪 ENUM TESTS
# ==========================================

class TestEnums:
    """Test enum definitions."""
    
    def test_signal_enum_members(self):
        """Verify Signal enum has expected members."""
        expected = ['NONE', 'BUY_YES', 'BUY_NO', 'HOLD', 'WATCH', 'DEAD', 'THETA']
        for name in expected:
            assert hasattr(Signal, name)
    
    def test_schedule_phase_values(self):
        """Verify SchedulePhase enum has emoji labels."""
        assert '💤' in SchedulePhase.SLEEP.value
        assert '🔥' in SchedulePhase.MANIC.value


# ==========================================
# 🧪 EDGE CASE TESTS
# ==========================================

class TestEdgeCases:
    """Test boundary conditions and edge cases."""
    
    def test_nbinom_negative_range(self):
        """Test NBinom handles negative range gracefully."""
        # This shouldn't happen in practice, but verify no crash
        result = TweetAnalyzer.calculate_nbinom_prob(-10, -5, 55.0, 5.0)
        assert result >= 0.0
    
    def test_kelly_price_100(self):
        """Test Kelly with price at 100 cents (certain outcome)."""
        frac, amount, reason = TweetAnalyzer.calculate_kelly(99.0, 100.0, 100, 200, 5.0)
        assert frac == 0.0
        assert reason == "N/A"
    
    def test_alpha_decay_at_deadline(self):
        """Test that alpha decays to ~0 at deadline."""
        # At days_left = 0.01, alpha should be nearly zero
        # We can't directly test alpha, but we can verify the prob changes
        prob_far = TweetAnalyzer.calculate_nbinom_prob(50, 60, 55.0, 10.0, 1.5)
        prob_near = TweetAnalyzer.calculate_nbinom_prob(50, 60, 55.0, 0.1, 1.5)
        # Near deadline should be more concentrated (Poisson-like)
        # Just verify no crash and reasonable values
        assert 0.0 <= prob_far <= 100.0
        assert 0.0 <= prob_near <= 100.0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
