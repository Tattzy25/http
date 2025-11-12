"""
Vercel serverless function handler for HTTP Connection Manager MCP Server
"""

import os
import json
import asyncio
import uuid
from datetime import datetime
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from psycopg2.extras import RealDictCursor
import httpx

# Load environment variables
DATABASE_URL = os.getenv('DATABASE_URL')

# Create FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    """Get database connection to NEON"""
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL environment variable not set")
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

# Session storage for MCP HTTP transport
active_sessions = {}  # session_id -> session_data
sse_connections = {}  # session_id -> queue

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "HTTP Connection Manager MCP Server", "version": "1.0.0", "transport": "streamable-http"}

@app.post("/mcp")
async def mcp_post(request: Request):
    """MCP HTTP Transport - POST endpoint for client messages"""
    try:
        # Get session ID from header
        session_id = request.headers.get("Mcp-Session-Id")
        protocol_version = request.headers.get("MCP-Protocol-Version", "2025-03-26")

        # Read JSON-RPC message
        body = await request.body()
        jsonrpc_message = json.loads(body.decode())

        # Handle the message
        response = await handle_mcp_message(jsonrpc_message, session_id, protocol_version)

        # If response is a stream, return SSE
        if isinstance(response, dict) and response.get("stream"):
            return StreamingResponse(
                sse_generator(response["stream_id"], session_id),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
            )
        else:
            # Single response
            return JSONResponse(content=response)

    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"jsonrpc": "2.0", "error": {"code": -32700, "message": str(e)}, "id": None}
        )

@app.get("/mcp")
async def mcp_get(request: Request):
    """MCP HTTP Transport - GET endpoint for SSE stream"""
    session_id = request.headers.get("Mcp-Session-Id")
    if not session_id:
        return JSONResponse(
            status_code=400,
            content={"error": "Mcp-Session-Id header required"}
        )

    return StreamingResponse(
        sse_generator(None, session_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )

async def handle_mcp_message(message: dict, session_id: str, protocol_version: str) -> dict:
    """Handle incoming MCP JSON-RPC message"""
    msg_id = message.get("id")
    method = message.get("method")

    # Initialize session if needed
    if not session_id and method == "initialize":
        session_id = f"session_{int(asyncio.get_event_loop().time() * 1000)}_{hash(str(message)) % 10000}"
        active_sessions[session_id] = {
            "initialized": False,
            "protocol_version": protocol_version,
            "created_at": datetime.now()
        }

    if not session_id or session_id not in active_sessions:
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32000, "message": "Invalid session"},
            "id": msg_id
        }

    session = active_sessions[session_id]

    # Handle initialize
    if method == "initialize":
        session["initialized"] = True
        return {
            "jsonrpc": "2.0",
            "result": {
                "protocolVersion": "2025-06-18",
                "capabilities": {
                    "tools": {
                        "listChanged": True
                    }
                },
                "serverInfo": {
                    "name": "HTTP Connection Manager",
                    "version": "1.0.0"
                }
            },
            "id": msg_id
        }

    # Handle initialized notification
    elif method == "notifications/initialized":
        return {"jsonrpc": "2.0", "result": {}, "id": msg_id}

    # Handle tools/list
    elif method == "tools/list":
        tools = [
            {
                "name": "create_connection",
                "description": "Create a new HTTP connection between endpoints",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Name of the connection"},
                        "source_url": {"type": "string", "description": "Source API endpoint URL"},
                        "source_method": {"type": "string", "default": "GET", "description": "HTTP method for source"},
                        "source_headers": {"type": "object", "description": "Headers for source request"},
                        "dest_url": {"type": "string", "description": "Destination API endpoint URL"},
                        "dest_method": {"type": "string", "default": "POST", "description": "HTTP method for destination"},
                        "dest_headers": {"type": "object", "description": "Headers for destination request"},
                        "mapping_rules": {"type": "array", "description": "Data mapping rules"}
                    },
                    "required": ["name", "source_url", "dest_url"]
                }
            },
            {
                "name": "list_connections",
                "description": "List all HTTP connections",
                "inputSchema": {"type": "object", "properties": {}}
            },
            {
                "name": "execute_connection",
                "description": "Execute an HTTP connection to transfer data between endpoints",
                "inputSchema": {
                    "type": "object",
                    "properties": {"connection_id": {"type": "string", "description": "ID of the connection to execute"}},
                    "required": ["connection_id"]
                }
            },
            {
                "name": "test_connection",
                "description": "Test a connection by making requests to both endpoints",
                "inputSchema": {
                    "type": "object",
                    "properties": {"connection_id": {"type": "string", "description": "ID of the connection to test"}},
                    "required": ["connection_id"]
                }
            },
            {
                "name": "delete_connection",
                "description": "Delete an HTTP connection",
                "inputSchema": {
                    "type": "object",
                    "properties": {"connection_id": {"type": "string", "description": "ID of the connection to delete"}},
                    "required": ["connection_id"]
                }
            },
            {
                "name": "get_connection_stats",
                "description": "Get detailed statistics for a connection",
                "inputSchema": {
                    "type": "object",
                    "properties": {"connection_id": {"type": "string", "description": "ID of the connection to get stats for"}},
                    "required": ["connection_id"]
                }
            }
        ]
        return {
            "jsonrpc": "2.0",
            "result": {"tools": tools},
            "id": msg_id
        }

    # Handle tools/call
    elif method == "tools/call":
        tool_name = message.get("params", {}).get("name")
        tool_args = message.get("params", {}).get("arguments", {})

        # Execute tool
        result = await execute_mcp_tool(tool_name, tool_args)

        return {
            "jsonrpc": "2.0",
            "result": result,
            "id": msg_id
        }

    else:
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32601, "message": f"Method '{method}' not found"},
            "id": msg_id
        }

async def execute_mcp_tool(tool_name: str, args: dict) -> dict:
    """Execute an MCP tool and return result"""
    try:
        if tool_name == "create_connection":
            result = await create_connection_db(args)
            return {"content": [{"type": "text", "text": result}]}

        elif tool_name == "list_connections":
            result = await list_connections_db()
            return {"content": [{"type": "text", "text": result}]}

        elif tool_name == "execute_connection":
            connection_id = args.get("connection_id")
            result = await execute_connection_db(connection_id)
            return {"content": [{"type": "text", "text": result}]}

        elif tool_name == "test_connection":
            connection_id = args.get("connection_id")
            result = await test_connection_db(connection_id)
            return {"content": [{"type": "text", "text": result}]}

        elif tool_name == "delete_connection":
            connection_id = args.get("connection_id")
            result = await delete_connection_db(connection_id)
            return {"content": [{"type": "text", "text": result}]}

        elif tool_name == "get_connection_stats":
            connection_id = args.get("connection_id")
            result = await get_connection_stats_db(connection_id)
            return {"content": [{"type": "text", "text": result}]}

        else:
            return {"content": [{"type": "text", "text": f"Unknown tool: {tool_name}"}]}

    except Exception as e:
        return {"content": [{"type": "text", "text": f"Error executing tool: {str(e)}"}]}

async def sse_generator(stream_id: str, session_id: str):
    """Generate SSE events for MCP transport"""
    if session_id not in sse_connections:
        sse_connections[session_id] = asyncio.Queue()

    queue = sse_connections[session_id]

    try:
        # Send initial connection event
        event_id = f"event_{int(asyncio.get_event_loop().time() * 1000)}"
        yield f"id: {event_id}\ndata: {json.dumps({'type': 'connected', 'session_id': session_id})}\n\n"

        while True:
            try:
                # Wait for events with timeout
                event = await asyncio.wait_for(queue.get(), timeout=30.0)

                event_id = f"event_{int(asyncio.get_event_loop().time() * 1000)}"
                yield f"id: {event_id}\ndata: {json.dumps(event)}\n\n"

                # If this was the final response for a stream, close it
                if event.get("type") == "response" and event.get("final", False):
                    break

            except asyncio.TimeoutError:
                # Send heartbeat
                event_id = f"event_{int(asyncio.get_event_loop().time() * 1000)}"
                yield f"id: {event_id}\ndata: {json.dumps({'type': 'heartbeat'})}\n\n"

    except Exception as e:
        print(f"SSE error: {e}")
    finally:
        if session_id in sse_connections:
            del sse_connections[session_id]

# Database operation functions
async def create_connection_db(args: dict) -> str:
    """Create a new HTTP connection in database"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO connections (name, source_url, source_method, source_headers,
                                   dest_url, dest_method, dest_headers, mapping_rules)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            args['name'],
            args['source_url'],
            args.get('source_method', 'GET'),
            json.dumps(args.get('source_headers', {})),
            args['dest_url'],
            args.get('dest_method', 'POST'),
            json.dumps(args.get('dest_headers', {})),
            json.dumps(args.get('mapping_rules', []))
        ))

        connection_id = cursor.fetchone()['id']
        conn.commit()

        return f"Connection created with ID: {connection_id}"

    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()

async def list_connections_db() -> str:
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

async def execute_connection_db(connection_id: str) -> str:
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

        # Apply mapping rules
        dest_data = apply_mapping_rules(source_data, connection['mapping_rules'])

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

async def test_connection_db(connection_id: str) -> str:
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

async def delete_connection_db(connection_id: str) -> str:
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

async def get_connection_stats_db(connection_id: str) -> str:
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

def apply_mapping_rules(data, rules):
    """Apply mapping rules to transform data"""
    if not rules:
        return data

    result = data
    for rule in rules:
        if rule.get('type') == 'jsonpath':
            # Simple JSONPath-like mapping
            source_path = rule.get('source', '')
            dest_path = rule.get('destination', '')

            # For now, just return the original data
            # In a full implementation, you'd use a JSONPath library
            pass

    return result

# Vercel serverless function handler
def handler(request):
    """Vercel serverless function entry point"""
    return app

    def list_connections(self):
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, source_url, source_method, source_headers,
                       dest_url, dest_method, dest_headers, mapping_rules,
                       created_at, last_executed, execution_count, success_count, error_count
                FROM connections ORDER BY created_at DESC
            """)
            connections = cursor.fetchall()
            cursor.close()
            conn.close()

            response = {
                "connections": [
                    {
                        "id": str(row['id']),
                        "name": row['name'],
                        "source_url": row['source_url'],
                        "source_method": row['source_method'],
                        "source_headers": row['source_headers'],
                        "dest_url": row['dest_url'],
                        "dest_method": row['dest_method'],
                        "dest_headers": row['dest_headers'],
                        "mapping_rules": row['mapping_rules'],
                        "created_at": row['created_at'].isoformat() if row['created_at'] else None,
                        "last_executed": row['last_executed'].isoformat() if row['last_executed'] else None,
                        "execution_count": row['execution_count'],
                        "success_count": row['success_count'],
                        "error_count": row['error_count']
                    } for row in connections
                ]
            }
            self.wfile.write(json.dumps(response).encode())
        except Exception as e:
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def create_connection(self, body):
        try:
            data = json.loads(body.decode())
            connection_id = str(uuid.uuid4())

            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO connections (id, name, source_url, source_method, source_headers,
                                       dest_url, dest_method, dest_headers, mapping_rules)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                connection_id,
                data['name'],
                data['source_url'],
                data.get('source_method', 'GET'),
                json.dumps(data.get('source_headers', {})),
                data['dest_url'],
                data.get('dest_method', 'POST'),
                json.dumps(data.get('dest_headers', {})),
                json.dumps(data.get('mapping_rules', []))
            ))
            conn.commit()
            cursor.close()
            conn.close()

            response = {"id": connection_id, "message": "Connection created"}
            self.wfile.write(json.dumps(response).encode())
        except Exception as e:
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def delete_connection(self, connection_id):
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM connections WHERE id = %s", (connection_id,))
            conn.commit()
            cursor.close()
            conn.close()

            response = {"message": "Connection deleted"}
            self.wfile.write(json.dumps(response).encode())
        except Exception as e:
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def execute_connection(self, connection_id, body):
        try:
            # Get connection details
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM connections WHERE id = %s", (connection_id,))
            connection = cursor.fetchone()
            cursor.close()
            conn.close()

            if not connection:
                self.wfile.write(json.dumps({"error": "Connection not found"}).encode())
                return

            # Parse request data
            request_data = json.loads(body.decode()) if body else {}

            # Execute source request
            async def execute():
                async with httpx.AsyncClient() as client:
                    # Source request
                    source_response = await client.request(
                        method=connection['source_method'],
                        url=connection['source_url'],
                        headers=connection['source_headers'] or {},
                        json=request_data
                    )
                    source_data = source_response.json()

                    # Apply mapping rules (simplified)
                    dest_data = source_data
                    if connection['mapping_rules']:
                        dest_data = self.apply_mapping_rules(source_data, connection['mapping_rules'])

                    # Destination request
                    dest_response = await client.request(
                        method=connection['dest_method'],
                        url=connection['dest_url'],
                        headers=connection['dest_headers'] or {},
                        json=dest_data
                    )

                    return {
                        "source_response": source_data,
                        "dest_response": dest_response.json(),
                        "status": dest_response.status_code
                    }

            # Run async function (simplified for Vercel)
            import asyncio
            result = asyncio.run(execute())

            # Update stats
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE connections
                SET last_executed = CURRENT_TIMESTAMP,
                    execution_count = execution_count + 1,
                    success_count = success_count + CASE WHEN %s < 400 THEN 1 ELSE 0 END,
                    error_count = error_count + CASE WHEN %s >= 400 THEN 1 ELSE 0 END
                WHERE id = %s
            """, (result['status'], result['status'], connection_id))
            conn.commit()
            cursor.close()
            conn.close()

            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def test_connection(self, connection_id):
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM connections WHERE id = %s", (connection_id,))
            connection = cursor.fetchone()
            cursor.close()
            conn.close()

            if not connection:
                self.wfile.write(json.dumps({"error": "Connection not found"}).encode())
                return

            response = {
                "id": str(connection['id']),
                "name": connection['name'],
                "source_url": connection['source_url'],
                "dest_url": connection['dest_url'],
                "status": "Connection exists"
            }
            self.wfile.write(json.dumps(response).encode())
        except Exception as e:
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def apply_mapping_rules(self, data, rules):
        """Apply simple mapping rules"""
        # Simplified mapping - just return data as-is for now
        return data