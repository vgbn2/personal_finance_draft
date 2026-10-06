package sovt

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
)

const (
	// Magic header string identifying SOVT binary time-series files
	Magic = "SOVT"

	// HeaderBytes is the fixed header size: 4 bytes magic + 4 bytes uint32 count
	HeaderBytes = 8

	// RecordBytes is the fixed size of each record: 6 x float64LE (48 bytes)
	RecordBytes = 48
)

var (
	ErrInvalidMagic       = errors.New("sovt: invalid magic header")
	ErrCorruptHeader      = errors.New("sovt: corrupt or truncated header")
	ErrShortRead          = errors.New("sovt: unexpected EOF reading records")
	ErrInvalidRecordBytes = errors.New("sovt: buffer length must be at least 48 bytes")
	ErrNonFiniteValue     = errors.New("sovt: record contains non-finite or NaN float value")
	ErrNegativeVolume     = errors.New("sovt: record volume cannot be negative")
	ErrInvalidOhlcBounds  = errors.New("sovt: low must be <= open/close <= high")
	ErrNonMonotonicTime   = errors.New("sovt: timestamps must be strictly monotonically increasing")
)

// Record represents a single OHLCV bar in native binary representation
type Record struct {
	TimestampMs float64
	Open        float64
	High        float64
	Low         float64
	Close       float64
	Volume      float64
}

// Header represents the 8-byte file prefix
type Header struct {
	Magic [4]byte
	Count uint32
}

// DecodeRecord decodes a 48-byte LittleEndian slice into a Record without heap allocation
func DecodeRecord(b []byte) (Record, error) {
	if len(b) < RecordBytes {
		return Record{}, ErrInvalidRecordBytes
	}
	r := Record{
		TimestampMs: math.Float64frombits(binary.LittleEndian.Uint64(b[0:8])),
		Open:        math.Float64frombits(binary.LittleEndian.Uint64(b[8:16])),
		High:        math.Float64frombits(binary.LittleEndian.Uint64(b[16:24])),
		Low:         math.Float64frombits(binary.LittleEndian.Uint64(b[24:32])),
		Close:       math.Float64frombits(binary.LittleEndian.Uint64(b[32:40])),
		Volume:      math.Float64frombits(binary.LittleEndian.Uint64(b[40:48])),
	}
	return r, nil
}

// EncodeRecord encodes a Record into a 48-byte LittleEndian slice
func EncodeRecord(r Record, b []byte) error {
	if len(b) < RecordBytes {
		return ErrInvalidRecordBytes
	}
	binary.LittleEndian.PutUint64(b[0:8], math.Float64bits(r.TimestampMs))
	binary.LittleEndian.PutUint64(b[8:16], math.Float64bits(r.Open))
	binary.LittleEndian.PutUint64(b[16:24], math.Float64bits(r.High))
	binary.LittleEndian.PutUint64(b[24:32], math.Float64bits(r.Low))
	binary.LittleEndian.PutUint64(b[32:40], math.Float64bits(r.Close))
	binary.LittleEndian.PutUint64(b[40:48], math.Float64bits(r.Volume))
	return nil
}

// Validate checks numerical integrity and OHLC invariants of a record
func (r Record) Validate() error {
	if !isFinite(r.TimestampMs) || !isFinite(r.Open) || !isFinite(r.High) ||
		!isFinite(r.Low) || !isFinite(r.Close) || !isFinite(r.Volume) {
		return ErrNonFiniteValue
	}
	if r.Volume < 0 {
		return ErrNegativeVolume
	}
	if r.Low > r.Open || r.Low > r.Close || r.High < r.Open || r.High < r.Close {
		return ErrInvalidOhlcBounds
	}
	return nil
}

func isFinite(f float64) bool {
	return !math.IsNaN(f) && !math.IsInf(f, 0)
}

// ReadHeader reads and parses the 8-byte SOVT header from an io.Reader
func ReadHeader(r io.Reader) (Header, error) {
	var buf [HeaderBytes]byte
	if _, err := io.ReadFull(r, buf[:]); err != nil {
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			return Header{}, ErrCorruptHeader
		}
		return Header{}, err
	}
	if string(buf[0:4]) != Magic {
		return Header{}, fmt.Errorf("%w: expected %s, got %s", ErrInvalidMagic, Magic, string(buf[0:4]))
	}
	count := binary.LittleEndian.Uint32(buf[4:8])
	var magicBytes [4]byte
	copy(magicBytes[:], buf[0:4])
	return Header{Magic: magicBytes, Count: count}, nil
}

// ReadFile reads and returns all valid records from an SOVT binary file
func ReadFile(filePath string) ([]Record, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	header, err := ReadHeader(f)
	if err != nil {
		return nil, err
	}

	records := make([]Record, header.Count)
	buf := make([]byte, int(header.Count)*RecordBytes)
	if _, err := io.ReadFull(f, buf); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrShortRead, err)
	}

	for i := 0; i < int(header.Count); i++ {
		offset := i * RecordBytes
		rec, _ := DecodeRecord(buf[offset : offset+RecordBytes])
		records[i] = rec
	}

	return records, nil
}

// WriteFile writes records to a file atomically with the standard SOVT binary format
func WriteFile(filePath string, records []Record) error {
	tmpPath := filePath + ".tmp"
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}

	headerBuf := make([]byte, HeaderBytes)
	copy(headerBuf[0:4], Magic)
	binary.LittleEndian.PutUint32(headerBuf[4:8], uint32(len(records)))

	if _, err := f.Write(headerBuf); err != nil {
		f.Close()
		os.Remove(tmpPath)
		return err
	}

	recordsBuf := make([]byte, len(records)*RecordBytes)
	for i, r := range records {
		offset := i * RecordBytes
		_ = EncodeRecord(r, recordsBuf[offset:offset+RecordBytes])
	}

	if _, err := f.Write(recordsBuf); err != nil {
		f.Close()
		os.Remove(tmpPath)
		return err
	}

	if err := f.Sync(); err != nil {
		f.Close()
		os.Remove(tmpPath)
		return err
	}

	if err := f.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}

	return os.Rename(tmpPath, filePath)
}
