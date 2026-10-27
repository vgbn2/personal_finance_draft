package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/sovereign/backend-go/pkg/sovt"
)

const (
	DefaultSocketPath = "/tmp/sovereign-feed.sock"
	BroadcastQueueCap = 1024
)

// Server coordinates incoming market ticks and broadcasts to connected UDS clients
type Server struct {
	socketPath string
	listener   net.Listener
	clients    map[net.Conn]struct{}
	mu         sync.RWMutex
	broadcast  chan []byte
	quit       chan struct{}
	wg         sync.WaitGroup
	stopOnce   sync.Once
}

// NewServer creates a new UDS streaming server
func NewServer(socketPath string) *Server {
	return &Server{
		socketPath: socketPath,
		clients:    make(map[net.Conn]struct{}),
		broadcast:  make(chan []byte, BroadcastQueueCap),
		quit:       make(chan struct{}),
	}
}

// Start begins listening on the Unix Domain Socket
func (s *Server) Start() error {
	// Remove stale socket if exists
	_ = os.Remove(s.socketPath)

	l, err := net.Listen("unix", s.socketPath)
	if err != nil {
		return fmt.Errorf("failed to listen on unix socket %s: %w", s.socketPath, err)
	}
	s.listener = l

	s.wg.Add(2)
	go s.acceptLoop()
	go s.broadcastLoop()

	return nil
}

func (s *Server) acceptLoop() {
	defer s.wg.Done()
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			select {
			case <-s.quit:
				return
			default:
				log.Printf("accept error: %v", err)
				return
			}
		}

		s.mu.Lock()
		s.clients[conn] = struct{}{}
		s.mu.Unlock()

		go s.handleClient(conn)
	}
}

func (s *Server) handleClient(conn net.Conn) {
	// Drain incoming client messages or wait until client closes
	buf := make([]byte, 128)
	for {
		_, err := conn.Read(buf)
		if err != nil {
			if err != io.EOF {
				// client dropped or closed
			}
			break
		}
	}

	s.mu.Lock()
	delete(s.clients, conn)
	s.mu.Unlock()
	_ = conn.Close()
}

func (s *Server) broadcastLoop() {
	defer s.wg.Done()
	for {
		select {
		case msg := <-s.broadcast:
			s.mu.RLock()
			for conn := range s.clients {
				// Non-blocking write to avoid slow-consumer backpressure
				_ = conn.SetWriteDeadline(time.Now().Add(50 * time.Millisecond))
				_, _ = conn.Write(msg)
			}
			s.mu.RUnlock()
		case <-s.quit:
			return
		}
	}
}

// PublishRecord broadcasts an SOVT binary record to all connected UDS clients
func (s *Server) PublishRecord(rec sovt.Record) error {
	var buf [sovt.RecordBytes]byte
	if err := sovt.EncodeRecord(rec, buf[:]); err != nil {
		return err
	}

	select {
	case s.broadcast <- buf[:]:
		return nil
	default:
		// Queue full; drop frame under backpressure
		return fmt.Errorf("broadcast queue full, frame dropped")
	}
}

// Stop gracefully closes the listener, disconnects clients, and unlinks the socket file
func (s *Server) Stop() {
	s.stopOnce.Do(func() {
		close(s.quit)
		if s.listener != nil {
			_ = s.listener.Close()
		}

		s.mu.Lock()
		for conn := range s.clients {
			_ = conn.Close()
		}
		s.clients = make(map[net.Conn]struct{})
		s.mu.Unlock()

		s.wg.Wait()
		_ = os.Remove(s.socketPath)
	})
}

func main() {
	defaultPath := os.Getenv("SOVEREIGN_FEEDD_SOCKET")
	if defaultPath == "" {
		defaultPath = DefaultSocketPath
	}
	socketPath := flag.String("socket", defaultPath, "Unix domain socket path for IPC broadcast")
	once := flag.Bool("once", false, "Run single self-check and exit 0")
	flag.Parse()

	server := NewServer(*socketPath)
	if err := server.Start(); err != nil {
		log.Fatalf("Server startup failed: %v", err)
	}
	defer server.Stop()

	log.Printf("sovereign-feedd streaming server listening on %s", *socketPath)

	if *once {
		// Self-check passed
		return
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	<-ctx.Done()
	log.Println("Shutting down sovereign-feedd...")
}
