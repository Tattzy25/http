#!/usr/bin/env python3
"""
Simple MCP client to test the HTTP Connection Manager server
"""
import asyncio
import json
import sys
import subprocess
import threading
import time
from typing import Dict, Any

class MCPClient:
    def __init__(self, server_command: list):
        self.server_command = server_command
        self.process = None
        self.response_queue = asyncio.Queue()

    async def start_server(self):
        """Start the MCP server process"""
        self.process = subprocess.Popen(
            self.server_command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )

        # Start reading stdout in a separate thread
        threading.Thread(target=self._read_stdout, daemon=True).start()

    def _read_stdout(self):
        """Read server stdout and put responses in queue"""
        while self.process and self.process.poll() is None:
            line = self.process.stdout.readline()
            if line.strip():
                try:
                    response = json.loads(line.strip())
                    asyncio.run_coroutine_threadsafe(
                        self.response_queue.put(response),
                        asyncio.get_event_loop()
                    )
                except json.JSONDecodeError:
                    print(f"Invalid JSON response: {line.strip()}")

    async def send_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Send a request to the server and wait for response"""
        if not self.process:
            raise RuntimeError("Server not started")

        # Send request
        request_json = json.dumps(request) + "\n"
        self.process.stdin.write(request_json)
        self.process.stdin.flush()

        # Wait for response
        try:
            response = await asyncio.wait_for(self.response_queue.get(), timeout=30.0)
            return response
        except asyncio.TimeoutError:
            raise RuntimeError("Timeout waiting for server response")

    async def close(self):
        """Close the server process"""
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()

async def test_mcp_server():
    """Test the MCP server with various tool calls"""
    print("🧪 Testing MCP Server Tools\n")

    # Start the server
    client = MCPClient(["uv", "run", "python", "server.py"])
    await client.start_server()

    # Wait a moment for server to initialize
    await asyncio.sleep(2)

    try:
        # Test 1: Initialize connection
        print("1. Testing initialize...")
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "test-client",
                    "version": "1.0.0"
                }
            }
        }
        response = await client.send_request(init_request)
        print(f"✅ Initialize response: {response}")

        # Test 2: List tools
        print("\n2. Testing tools/list...")
        tools_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }
        response = await client.send_request(tools_request)
        print(f"✅ Tools list: {len(response.get('result', {}).get('tools', []))} tools available")

        # Test 3: Create connection
        print("\n3. Testing create_connection...")
        create_request = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "create_connection",
                "arguments": {
                    "conn_data": {
                        "name": "Test API Connection",
                        "source_url": "https://httpbin.org/get",
                        "source_method": "GET",
                        "dest_url": "https://httpbin.org/post",
                        "dest_method": "POST",
                        "mapping_rules": [
                            {"source_path": "$.url", "dest_field": "source_url"},
                            {"source_path": "$.headers.Host", "dest_field": "host"}
                        ]
                    }
                }
            }
        }
        response = await client.send_request(create_request)
        print(f"✅ Create connection result: {response}")

        # Extract connection ID
        if "result" in response and "content" in response["result"]:
            result_text = response["result"]["content"][0]["text"]
            if "ID:" in result_text:
                connection_id = result_text.split("ID: ")[1].strip()
                print(f"📝 Connection ID: {connection_id}")

                # Test 4: List connections
                print("\n4. Testing list_connections...")
                list_request = {
                    "jsonrpc": "2.0",
                    "id": 4,
                    "method": "tools/call",
                    "params": {
                        "name": "list_connections",
                        "arguments": {}
                    }
                }
                response = await client.send_request(list_request)
                print(f"✅ List connections result: {response}")

                # Test 5: Execute connection
                print("\n5. Testing execute_connection...")
                execute_request = {
                    "jsonrpc": "2.0",
                    "id": 5,
                    "method": "tools/call",
                    "params": {
                        "name": "execute_connection",
                        "arguments": {
                            "connection_id": connection_id
                        }
                    }
                }
                response = await client.send_request(execute_request)
                print(f"✅ Execute connection result: {response}")

                # Test 6: Test connection
                print("\n6. Testing test_connection...")
                test_request = {
                    "jsonrpc": "2.0",
                    "id": 6,
                    "method": "tools/call",
                    "params": {
                        "name": "test_connection",
                        "arguments": {
                            "connection_id": connection_id
                        }
                    }
                }
                response = await client.send_request(test_request)
                print(f"✅ Test connection result: {response}")

                # Test 7: Get connection stats
                print("\n7. Testing get_connection_stats...")
                stats_request = {
                    "jsonrpc": "2.0",
                    "id": 7,
                    "method": "tools/call",
                    "params": {
                        "name": "get_connection_stats",
                        "arguments": {
                            "connection_id": connection_id
                        }
                    }
                }
                response = await client.send_request(stats_request)
                print(f"✅ Get stats result: {response}")

                # Test 8: Delete connection
                print("\n8. Testing delete_connection...")
                delete_request = {
                    "jsonrpc": "2.0",
                    "id": 8,
                    "method": "tools/call",
                    "params": {
                        "name": "delete_connection",
                        "arguments": {
                            "connection_id": connection_id
                        }
                    }
                }
                response = await client.send_request(delete_request)
                print(f"✅ Delete connection result: {response}")

        print("\n🎉 All MCP server tests completed successfully!")

    except Exception as e:
        print(f"❌ Test failed: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(test_mcp_server())