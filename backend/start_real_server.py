#!/usr/bin/env python3
"""
REAL SERVER STARTER - Start the actual HTTP server for testing
"""

import os
import sys
import subprocess
from http.server import HTTPServer
from api.index import handler

def start_real_server():
    """Start the real HTTP server"""

    # Set environment variable for testing (you'll need to set your real DATABASE_URL)
    if not os.getenv('DATABASE_URL'):
        print("⚠️  WARNING: DATABASE_URL not set. Set it to your real NEON database URL for full testing.")
        print("   For now, we'll run with mock database operations.")
        os.environ['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test'  # Mock URL

    print("🚀 STARTING REAL HTTP SERVER...")
    print("📡 Server will be available at: http://localhost:8000")
    print("🔴 SSE streaming endpoint: http://localhost:8000/events")
    print("🔴 API endpoints: http://localhost:8000/api/*")
    print("🔴 Status endpoint: http://localhost:8000/status")
    print()

    try:
        # Start server on port 8000
        server = HTTPServer(('localhost', 8000), handler)
        print("✅ Server started successfully!")
        print("Press Ctrl+C to stop the server")
        print()

        server.serve_forever()

    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server failed to start: {e}")

if __name__ == "__main__":
    start_real_server()