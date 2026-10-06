package main

import (
	"io"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/sovereign/backend-go/pkg/sovt"
)

func TestStreamingServerUDSLifecycle(t *testing.T) {
	tmpDir := t.TempDir()
	socketPath := filepath.Join(tmpDir, "test_feed.sock")

	server := NewServer(socketPath)
	if err := server.Start(); err != nil {
		t.Fatalf("server.Start() failed: %v", err)
	}
	defer server.Stop()

	// 1. Verify socket file created
	if _, err := os.Stat(socketPath); os.IsNotExist(err) {
		t.Fatalf("expected socket file %s to exist", socketPath)
	}

	// 2. Connect client
	clientConn, err := net.Dial("unix", socketPath)
	if err != nil {
		t.Fatalf("net.Dial(unix, %s) failed: %v", socketPath, err)
	}
	defer clientConn.Close()

	// Give accept loop a moment to register client
	time.Sleep(20 * time.Millisecond)

	// 3. Publish SOVT record
	expectedRec := sovt.Record{
		TimestampMs: 1711756800000.0,
		Open:        68500.25,
		High:        69200.00,
		Low:         68400.10,
		Close:       69050.75,
		Volume:      450.80,
	}

	if err := server.PublishRecord(expectedRec); err != nil {
		t.Fatalf("PublishRecord failed: %v", err)
	}

	// 4. Read from client
	buf := make([]byte, sovt.RecordBytes)
	_ = clientConn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	if _, err := io.ReadFull(clientConn, buf); err != nil {
		t.Fatalf("client ReadFull failed: %v", err)
	}

	decoded, err := sovt.DecodeRecord(buf)
	if err != nil {
		t.Fatalf("DecodeRecord failed: %v", err)
	}

	if decoded != expectedRec {
		t.Errorf("received record mismatch: got %+v, want %+v", decoded, expectedRec)
	}

	// 5. Test clean stop & unlinking
	server.Stop()
	if _, err := os.Stat(socketPath); !os.IsNotExist(err) {
		t.Errorf("expected socket file %s to be deleted after Stop()", socketPath)
	}
}
