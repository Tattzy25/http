"""
Simple MCP Server for HTTP Connection Management
Just like the Zapier example - clean and minimal
"""

import os
import json
import asyncio
from datetime import datetime
import httpx
import psycopg2
from psycopg2.extras import RealDictCursor
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize MCP server
mcp = FastMCP("HTTP Connection Manager")

# Database connection
def get_db_connection():
    """Get database connection to NEON"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise ValueError("DATABASE_URL environment variable not set")
    return psycopg2.connect(database_url, cursor_factory=RealDictCursor)

def init_database():
    """Initialize database tables"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Create connections table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source_url TEXT NOT NULL,
                source_method TEXT NOT NULL DEFAULT 'GET',
                source_headers JSONB,
                dest_url TEXT NOT NULL,
                dest_method TEXT NOT NULL DEFAULT 'POST',
                dest_headers JSONB,
                mapping_rules JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_executed TIMESTAMP,
                execution_count INTEGER DEFAULT 0,
                success_count INTEGER DEFAULT 0,
                error_count INTEGER DEFAULT 0
            )
        ''')

        # Create execution logs table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS execution_logs (
                id SERIAL PRIMARY KEY,
                connection_id TEXT REFERENCES connections(id),
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN NOT NULL,
                source_response JSONB,
                dest_response JSONB,
                error_message TEXT,
                execution_time_ms INTEGER
            )
        ''')

        conn.commit()
        print("✅ Database initialized")

    except Exception as e:
        print(f"❌ Database init failed: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

@mcp.tool()
async def create_connection(name: str, source_url: str, dest_url: str,
                          source_method: str = "GET", dest_method: str = "POST",
                          source_headers: str = None, dest_headers: str = None) -> str:
    """Create a new HTTP connection between endpoints"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        connection_id = f"conn_{int(asyncio.get_event_loop().time() * 1000)}"

        cursor.execute("""
            INSERT INTO connections (id, name, source_url, source_method, source_headers,
                                   dest_url, dest_method, dest_headers)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            connection_id, name, source_url, source_method,
            source_headers, dest_url, dest_method, dest_headers
        ))

        conn.commit()
        return f"Connection created: {connection_id}"

    except Exception as e:
        conn.rollback()
        return f"Error creating connection: {str(e)}"
    finally:
        cursor.close()
        conn.close()

@mcp.tool()
async def list_connections() -> str:
    """List all HTTP connections"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT id, name, source_url, dest_url FROM connections ORDER BY created_at DESC")
        connections = cursor.fetchall()

        if not connections:
            return "No connections found"

        result = "HTTP Connections:\n"
        for row in connections:
            result += f"- {row['id']}: {row['name']} ({row['source_url']} -> {row['dest_url']})\n"

        return result

    finally:
        cursor.close()
        conn.close()

@mcp.tool()
async def execute_connection(connection_id: str) -> str:
    """Execute an HTTP connection to transfer data between endpoints"""
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

        # Execute destination request
        async with httpx.AsyncClient() as client:
            dest_response = await client.request(
                method=connection['dest_method'],
                url=connection['dest_url'],
                headers=connection['dest_headers'] or {},
                content=source_response.text
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

        return f"Executed {connection_id}: {source_response.status_code} -> {dest_response.status_code}"

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
        return f"Error executing connection: {str(e)}"
    finally:
        cursor.close()
        conn.close()

@mcp.tool()
async def delete_connection(connection_id: str) -> str:
    """Delete an HTTP connection"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("DELETE FROM connections WHERE id = %s", (connection_id,))
        if cursor.rowcount > 0:
            conn.commit()
            return f"Connection {connection_id} deleted"
        else:
            return f"Connection {connection_id} not found"

    except Exception as e:
        conn.rollback()
        return f"Error deleting connection: {str(e)}"
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    # Initialize database
    init_database()

    # Run MCP server
    print("🚀 Starting simple MCP server...")
    mcp.run()