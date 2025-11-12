"""
Vercel serverless function for HTTP Connection Manager
Handles HTTP requests and REAL SSE streaming for the connection management API
"""
import os
import json
import asyncio
import threading
import time
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler
import sys
import io
from contextlib import redirect_stdout, redirect_stderr
from queue import Queue
import psycopg2
from psycopg2.extras import RealDictCursor
import httpx

# Load environment variables
DATABASE_URL = os.getenv('DATABASE_URL')

# Global event queue for SSE broadcasting
event_queue = Queue()
active_sse_connections = set()

def get_db_connection():
    """Get database connection to NEON"""
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL environment variable not set")
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

class ConnectionCreate:
    """Connection creation data model"""
    def __init__(self, name, source_url, dest_url, source_method="GET", dest_method="POST",
                 source_headers=None, dest_headers=None, mapping_rules=None):
        self.name = name
        self.source_url = source_url
        self.dest_url = dest_url
        self.source_method = source_method
        self.dest_method = dest_method
        self.source_headers = source_headers or {}
        self.dest_headers = dest_headers or {}
        self.mapping_rules = mapping_rules or []

async def create_connection(conn_data):
    """Create a new HTTP connection in database"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        connection_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO connections (id, name, source_url, source_method, source_headers,
                                   dest_url, dest_method, dest_headers, mapping_rules)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            connection_id,
            conn_data.name,
            conn_data.source_url,
            conn_data.source_method,
            json.dumps(conn_data.source_headers),
            conn_data.dest_url,
            conn_data.dest_method,
            json.dumps(conn_data.dest_headers),
            json.dumps(conn_data.mapping_rules)
        ))

        conn.commit()
        return f"Connection created with ID: {connection_id}"

    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()

async def list_connections():
    """List all connections from database"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT id, name, source_url, dest_url, created_at, execution_count
            FROM connections ORDER BY created_at DESC
        """)

        connections = cursor.fetchall()
        result = "HTTP Connections:\n"
        for row in connections:
            result += f"- ID: {row['id']}, Name: {row['name']}, Source: {row['source_url']}, Dest: {row['dest_url']}, Executions: {row['execution_count']}\n"

        return result if connections else "No connections found."

    finally:
        cursor.close()
        conn.close()

async def execute_connection(connection_id, custom_data=None):
    """Execute a connection"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Get connection details
        cursor.execute("SELECT * FROM connections WHERE id = %s", (connection_id,))
        connection = cursor.fetchone()

        if not connection:
            return f"Connection {connection_id} not found"

        # Execute source request
        async with httpx.AsyncClient() as client:
            source_response = await client.request(
                method=connection['source_method'],
                url=connection['source_url'],
                headers=connection['source_headers'] or {}
            )

            source_data = source_response.json() if source_response.headers.get('content-type', '').startswith('application/json') else source_response.text

        # Apply mapping rules (simplified)
        dest_data = source_data

        # Execute destination request
        async with httpx.AsyncClient() as client:
            dest_response = await client.request(
                method=connection['dest_method'],
                url=connection['dest_url'],
                headers=connection['dest_headers'] or {},
                json=dest_data if isinstance(dest_data, dict) else None,
                content=dest_data if not isinstance(dest_data, dict) else None
            )

        # Update statistics
        cursor.execute("""
            UPDATE connections
            SET last_executed = NOW(),
                execution_count = execution_count + 1,
                success_count = success_count + CASE WHEN %s < 400 THEN 1 ELSE 0 END,
                error_count = error_count + CASE WHEN %s >= 400 THEN 1 ELSE 0 END
            WHERE id = %s
        """, (dest_response.status_code, dest_response.status_code, connection_id))

        conn.commit()

        return f"Connection executed successfully. Source status: {source_response.status_code}, Destination status: {dest_response.status_code}"

    except Exception as e:
        # Update error count
        cursor.execute("""
            UPDATE connections
            SET last_executed = NOW(),
                execution_count = execution_count + 1,
                error_count = error_count + 1
            WHERE id = %s
        """, (connection_id,))
        conn.commit()
        raise e
    finally:
        cursor.close()
        conn.close()

async def test_connection(connection_id):
    """Test a connection by making requests to both endpoints"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM connections WHERE id = %s", (connection_id,))
        connection = cursor.fetchone()

        if not connection:
            return f"Connection {connection_id} not found"

        results = []

        # Test source endpoint
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.request(
                    method=connection['source_method'],
                    url=connection['source_url'],
                    headers=connection['source_headers'] or {}
                )
            results.append(f"Source endpoint: {response.status_code} - {'OK' if response.status_code < 400 else 'ERROR'}")
        except Exception as e:
            results.append(f"Source endpoint: ERROR - {str(e)}")

        # Test destination endpoint (with dummy data)
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.request(
                    method=connection['dest_method'],
                    url=connection['dest_url'],
                    headers=connection['dest_headers'] or {},
                    json={"test": "data"}
                )
            results.append(f"Destination endpoint: {response.status_code} - {'OK' if response.status_code < 400 else 'ERROR'}")
        except Exception as e:
            results.append(f"Destination endpoint: ERROR - {str(e)}")

        return f"Connection test results:\n" + "\n".join(results)

    finally:
        cursor.close()
        conn.close()

async def delete_connection(connection_id):
    """Delete a connection from database"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("DELETE FROM connections WHERE id = %s", (connection_id,))
        if cursor.rowcount > 0:
            conn.commit()
            return f"Connection {connection_id} deleted successfully"
        else:
            return f"Connection {connection_id} not found"

    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()

async def get_connection_stats(connection_id):
    """Get detailed statistics for a connection"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT id, name, source_url, dest_url, created_at, last_executed,
                   execution_count, success_count, error_count
            FROM connections WHERE id = %s
        """, (connection_id,))

        connection = cursor.fetchone()
        if not connection:
            return f"Connection {connection_id} not found"

        stats = f"""Connection Statistics:
ID: {connection['id']}
Name: {connection['name']}
Source URL: {connection['source_url']}
Destination URL: {connection['dest_url']}
Created: {connection['created_at']}
Last Executed: {connection['last_executed'] or 'Never'}
Total Executions: {connection['execution_count']}
Successful Executions: {connection['success_count']}
Failed Executions: {connection['error_count']}
Success Rate: {(connection['success_count'] / connection['execution_count'] * 100) if connection['execution_count'] > 0 else 0:.1f}%
"""

        return stats

    finally:
        cursor.close()
        conn.close()

# Global event queue for SSE broadcasting
event_queue = Queue()
active_sse_connections = set()

class SSEConnection:
    """Real SSE connection handler with robust error handling"""
    def __init__(self, handler):
        self.handler = handler
        self.active = True
        self.last_heartbeat = time.time()
        self.created_at = time.time()
        self.events_sent = 0
        self.lock = threading.Lock()

    def send_event(self, event_data):
        """Send an SSE event with error handling"""
        if not self.active:
            return False

        try:
            with self.lock:
                if not self.active:  # Double-check after acquiring lock
                    return False

                event_str = f"data: {json.dumps(event_data)}\n\n"
                self.handler.wfile.write(event_str.encode('utf-8'))
                self.handler.wfile.flush()
                self.last_heartbeat = time.time()
                self.events_sent += 1
                return True

        except (BrokenPipeError, ConnectionResetError, OSError) as e:
            print(f"SSE connection broken: {e}")
            self.active = False
            return False
        except Exception as e:
            print(f"SSE send error: {e}")
            self.active = False
            return False

    def send_heartbeat(self):
        """Send heartbeat to keep connection alive"""
        if not self.active:
            return False

        try:
            with self.lock:
                if not self.active:
                    return False

                heartbeat = f"data: {json.dumps({'type': 'heartbeat', 'timestamp': datetime.now().isoformat()})}\n\n"
                self.handler.wfile.write(heartbeat.encode('utf-8'))
                self.handler.wfile.flush()
                return True

        except (BrokenPipeError, ConnectionResetError, OSError) as e:
            print(f"SSE heartbeat failed: {e}")
            self.active = False
            return False
        except Exception as e:
            print(f"SSE heartbeat error: {e}")
            self.active = False
            return False

    def close(self):
        """Explicitly close the connection"""
        with self.lock:
            self.active = False

    def get_stats(self):
        """Get connection statistics"""
        return {
            "active": self.active,
            "created_at": self.created_at,
            "last_heartbeat": self.last_heartbeat,
            "events_sent": self.events_sent,
            "age_seconds": time.time() - self.created_at
        }

def sse_broadcaster():
    """Background thread that broadcasts events to all SSE connections with robust error handling"""
    while True:
        try:
            # Get event from queue with timeout
            event_data = event_queue.get(timeout=1.0)

            # Broadcast to all active connections
            dead_connections = []
            active_count = 0

            for conn in active_sse_connections.copy():
                try:
                    if conn.send_event(event_data):
                        active_count += 1
                    else:
                        dead_connections.append(conn)
                except Exception as e:
                    print(f"Error broadcasting to connection: {e}")
                    dead_connections.append(conn)

            # Remove dead connections
            for conn in dead_connections:
                active_sse_connections.discard(conn)

            print(f"Broadcasted event '{event_data.get('type', 'unknown')}' to {active_count} active connections")

        except:
            # Queue timeout - perform maintenance
            dead_connections = []
            current_time = time.time()
            active_count = 0

            for conn in active_sse_connections.copy():
                try:
                    # Check if connection is too old
                    if current_time - conn.last_heartbeat > 300:  # 5 minute timeout
                        print("Connection timed out, removing")
                        dead_connections.append(conn)
                    else:
                        # Send heartbeat and count as active if successful
                        if conn.send_heartbeat():
                            active_count += 1
                        else:
                            dead_connections.append(conn)
                except Exception as e:
                    print(f"Error during maintenance: {e}")
                    dead_connections.append(conn)

            # Remove dead connections
            for conn in dead_connections:
                active_sse_connections.discard(conn)

            if active_count > 0:
                print(f"SSE maintenance: {active_count} active connections, removed {len(dead_connections)} dead connections")

# Start the broadcaster thread
broadcaster_thread = threading.Thread(target=sse_broadcaster, daemon=True)
broadcaster_thread.start()

def broadcast_event(event_type, data):
    """Broadcast an event to all SSE clients"""
    event_data = {
        "type": event_type,
        "data": data,
        "timestamp": datetime.now().isoformat()
    }
    event_queue.put(event_data)

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests"""
        try:
            path = self.path

            # CORS headers
            self.send_cors_headers()

            if path == "/":
                self.send_json_response({"message": "HTTP Connection Manager API", "version": "1.0.0"})
                return

            elif path == "/api/connections":
                # List connections
                result = asyncio.run(list_connections())
                self.send_json_response({"result": result})

            elif path.startswith("/api/connections/") and "/test" in path:
                # Test connection
                connection_id = path.split("/api/connections/")[1].split("/test")[0]
                result = asyncio.run(test_connection(connection_id))
                broadcast_event("connection_tested", {"connection_id": connection_id, "result": result})
                self.send_json_response({"result": result})

            elif path.startswith("/api/connections/") and "/stats" in path:
                # Get connection stats
                connection_id = path.split("/api/connections/")[1].split("/stats")[0]
                result = asyncio.run(get_connection_stats(connection_id))
                self.send_json_response({"result": result})

            elif path == "/status":
                # Real-time system status
                status_data = {
                    "active_sse_connections": len(active_sse_connections),
                    "total_events_queued": event_queue.qsize(),
                    "broadcaster_thread_alive": broadcaster_thread.is_alive(),
                    "database_url_configured": bool(DATABASE_URL),
                    "timestamp": datetime.now().isoformat()
                }

                # Add connection details
                connections_info = []
                for i, conn in enumerate(active_sse_connections):
                    stats = conn.get_stats()
                    connections_info.append({
                        "id": i + 1,
                        "active": stats["active"],
                        "age_seconds": stats["age_seconds"],
                        "events_sent": stats["events_sent"],
                        "last_heartbeat": stats["last_heartbeat"]
                    })

                status_data["connections"] = connections_info
                self.send_json_response(status_data)

            elif path == "/events":
                # REAL SSE endpoint - keeps connection open and streams events
                self.handle_sse_connection()

            else:
                self.send_error_response(404, "Not found")

        except Exception as e:
            self.send_error_response(500, str(e))

    def handle_sse_connection(self):
        """Handle real SSE connection that stays open and streams events"""
        # Send SSE headers
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Cache-Control')
        self.end_headers()

        # Create SSE connection
        sse_conn = SSEConnection(self)
        active_sse_connections.add(sse_conn)

        try:
            # Send initial connected event
            sse_conn.send_event({
                "type": "connected",
                "message": "SSE connection established",
                "timestamp": datetime.now().isoformat()
            })

            # Keep connection open and stream events with proper keep-alive
            while sse_conn.active:
                try:
                    # Check connection health every 5 seconds
                    time.sleep(5.0)

                    # Send periodic heartbeat to detect broken connections
                    if not sse_conn.send_heartbeat():
                        print("Heartbeat failed, closing SSE connection")
                        break

                    # Check if client has sent any data (indicating they might want to close)
                    # This is a more sophisticated keep-alive check
                    try:
                        # Non-blocking check for client data
                        import select
                        if hasattr(self.connection, 'fileno'):
                            ready, _, _ = select.select([self.connection], [], [], 0)
                            if ready:
                                # Client sent data, check if it's a disconnect signal
                                peek_data = self.rfile.peek(1)
                                if not peek_data:
                                    print("Client disconnected (empty peek)")
                                    break
                    except:
                        # select not available or connection check failed
                        pass

                except Exception as e:
                    print(f"SSE connection error: {e}")
                    break

        except Exception as e:
            print(f"SSE handler error: {e}")
        finally:
            # Remove connection when done
            active_sse_connections.discard(sse_conn)

    def do_POST(self):
        """Handle POST requests"""
        try:
            path = self.path
            self.send_cors_headers()

            if path == "/api/connections":
                # Create connection
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(post_data)

                conn_data = ConnectionCreate(**data)
                result = asyncio.run(create_connection(conn_data))

                # Broadcast real event to SSE clients
                broadcast_event("connection_created", {
                    "connection_id": result.split("ID: ")[-1] if "ID: " in result else "unknown",
                    "name": data.get('name'),
                    "source_url": data.get('source_url'),
                    "dest_url": data.get('dest_url')
                })

                self.send_json_response({"result": result})

            elif path.startswith("/api/connections/") and "/execute" in path:
                # Execute connection
                connection_id = path.split("/api/connections/")[1].split("/execute")[0]
                result = asyncio.run(execute_connection(connection_id, None))

                # Broadcast real event to SSE clients
                broadcast_event("connection_executed", {
                    "connection_id": connection_id,
                    "result": result,
                    "timestamp": datetime.now().isoformat()
                })

                self.send_json_response({"result": result})

            else:
                self.send_error_response(404, "Not found")

        except Exception as e:
            self.send_error_response(500, str(e))

    def do_DELETE(self):
        """Handle DELETE requests"""
        try:
            path = self.path
            self.send_cors_headers()

            if path.startswith("/api/connections/"):
                # Delete connection
                connection_id = path.split("/api/connections/")[1]
                result = asyncio.run(delete_connection(connection_id))

                # Broadcast real event to SSE clients
                broadcast_event("connection_deleted", {
                    "connection_id": connection_id,
                    "result": result
                })

                self.send_json_response({"result": result})

            else:
                self.send_error_response(404, "Not found")

        except Exception as e:
            self.send_error_response(500, str(e))

    def do_OPTIONS(self):
        """Handle OPTIONS requests for CORS"""
        self.send_cors_headers()
        self.end_headers()

    def send_cors_headers(self):
        """Send CORS headers"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Content-Type', 'application/json')

    def send_json_response(self, data):
        """Send JSON response"""
        response = json.dumps(data)
        self.send_header('Content-Length', str(len(response)))
        self.end_headers()
        self.wfile.write(response.encode('utf-8'))

    def send_error_response(self, code, message):
        """Send error response"""
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        error_data = json.dumps({"error": message})
        self.send_header('Content-Length', str(len(error_data)))
        self.end_headers()
        self.wfile.write(error_data.encode('utf-8'))

    def log_message(self, format, *args):
        """Override to prevent logging to stderr"""
        pass