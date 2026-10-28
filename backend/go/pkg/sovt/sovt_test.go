package sovt

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

var repoRoot = func() string {
	if env := os.Getenv("SOVEREIGN_REPO_ROOT"); env != "" {
		return env
	}
	if rel, err := filepath.Abs("../../../"); err == nil {
		if _, err := os.Stat(filepath.Join(rel, "package.json")); err == nil {
			return rel
		}
	}
	return "/home/vgbn/Documents/codeptit/sovereign-trades"
}()

type RealBarFixture struct {
	FetchedAt string `json:"fetched_at"`
	Sources   []struct {
		Family    string  `json:"family"`
		Provider  string  `json:"provider"`
		Symbol    string  `json:"symbol"`
		Timeframe string  `json:"timeframe"`
		Timestamp string  `json:"timestamp"`
		Open      float64 `json:"open"`
		High      float64 `json:"high"`
		Low       float64 `json:"low"`
		Close     float64 `json:"close"`
		Volume    float64 `json:"volume"`
	} `json:"sources"`
}

func TestRealHistoricalBinaryFile(t *testing.T) {
	realBinPath := filepath.Join(repoRoot, "storage", "data", "ts", "AAPL_1d.bin")
	if _, err := os.Stat(realBinPath); os.IsNotExist(err) {
		t.Skipf("real binary index not found at %s", realBinPath)
	}

	records, err := ReadFile(realBinPath)
	if err != nil {
		t.Fatalf("ReadFile(%s) failed: %v", realBinPath, err)
	}

	if len(records) == 0 {
		t.Fatalf("expected non-empty records from %s", realBinPath)
	}

	var prevTime float64
	for i, r := range records {
		if err := r.Validate(); err != nil {
			t.Errorf("record[%d] validation failed: %v (data: %+v)", i, err, r)
		}
		if i > 0 && r.TimestampMs <= prevTime {
			t.Errorf("record[%d] timestamp %f not strictly monotonic after %f", i, r.TimestampMs, prevTime)
		}
		prevTime = r.TimestampMs
	}

	t.Logf("Successfully decoded and validated %d real AAPL 1d bars from disk", len(records))
}

func TestRealBarsBtcFixture(t *testing.T) {
	fixturePath := filepath.Join(repoRoot, "tests", "fixtures", "real_bars_btc.json")
	data, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("failed to read fixture %s: %v", fixturePath, err)
	}

	var fixture RealBarFixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatalf("failed to parse fixture json: %v", err)
	}

	if len(fixture.Sources) == 0 {
		t.Fatal("fixture sources array is empty")
	}

	tmpDir := t.TempDir()
	outBin := filepath.Join(tmpDir, "BTCUSDT_1h.bin")

	records := make([]Record, len(fixture.Sources))
	for i, s := range fixture.Sources {
		records[i] = Record{
			Open:   s.Open,
			High:   s.High,
			Low:    s.Low,
			Close:  s.Close,
			Volume: s.Volume,
		}
	}

	if err := WriteFile(outBin, records); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	readBack, err := ReadFile(outBin)
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}

	if len(readBack) != len(records) {
		t.Fatalf("count mismatch: got %d, want %d", len(readBack), len(records))
	}

	for i, r := range records {
		if readBack[i].Open != r.Open || readBack[i].High != r.High ||
			readBack[i].Low != r.Low || readBack[i].Close != r.Close ||
			readBack[i].Volume != r.Volume {
			t.Errorf("record[%d] mismatch against real fixture: got %+v, want %+v", i, readBack[i], r)
		}
	}
}

func BenchmarkDecodeRealHistoricalData(b *testing.B) {
	realBinPath := filepath.Join(repoRoot, "storage", "data", "ts", "AAPL_1d.bin")
	rawBytes, err := os.ReadFile(realBinPath)
	if err != nil {
		b.Skipf("cannot read %s: %v", realBinPath, err)
	}

	recordData := rawBytes[HeaderBytes:]
	numRecords := len(recordData) / RecordBytes

	b.SetBytes(int64(len(recordData)))
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		for j := 0; j < numRecords; j++ {
			offset := j * RecordBytes
			_, _ = DecodeRecord(recordData[offset : offset+RecordBytes])
		}
	}
}
