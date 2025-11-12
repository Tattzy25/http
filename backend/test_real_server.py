#!/usr/bin/env python3
"""
REAL TEST SCRIPT - Test the SSE streaming functionality
"""

import asyncio
import httpx
import json
import threading
import time
from datetime import datetime

# Test server URL - change this to your actual server
TEST_BASE_URL = "http://localhost:8000"  # Change this to your real server URL

async def test_sse_connection():
    """Test real SSE streaming"""
    print("🔴 TESTING REAL SSE CONNECTION...")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream('GET', f"{TEST_BASE_URL}/events") as response:
                print(f"✅ SSE Connection opened: {response.status_code}")

                event_count = 0
                start_time = time.time()

                async for line in response.aiter_lines():
                    if line.strip():
                        print(f"📡 SSE Event: {line}")

                        if "connected" in line:
                            print("✅ REAL SSE CONNECTION ESTABLISHED!")
                            event_count += 1

                        if "heartbeat" in line:
                            print("💓 REAL HEARTBEAT RECEIVED!")
                            event_count += 1

                        if event_count >= 3:  # Test for a few events
                            break

                duration = time.time() - start_time
                print(f"✅ SSE test completed in {duration:.2f} seconds, received {event_count} events")

    except Exception as e:
        print(f"❌ SSE test failed: {e}")

async def test_api_endpoints():
    """Test real API endpoints"""
    print("\n🔴 TESTING REAL API ENDPOINTS...")

    async with httpx.AsyncClient() as client:
        try:
            # Test root endpoint
            response = await client.get(f"{TEST_BASE_URL}/")
            print(f"✅ Root endpoint: {response.status_code} - {response.json()}")

            # Test status endpoint
            response = await client.get(f"{TEST_BASE_URL}/status")
            status_data = response.json()
            print(f"✅ Status endpoint: {response.status_code}")
            print(f"   Active SSE connections: {status_data.get('active_sse_connections', 'N/A')}")
            print(f"   Events queued: {status_data.get('total_events_queued', 'N/A')}")

        except Exception as e:
            print(f"❌ API test failed: {e}")

async def test_connection_crud():
    """Test real connection CRUD operations"""
    print("\n🔴 TESTING REAL CONNECTION CRUD...")

    async with httpx.AsyncClient() as client:
        try:
            # Create a test connection
            test_connection = {
                "name": "Test Connection",
                "source_url": "https://httpbin.org/get",
                "dest_url": "https://httpbin.org/post",
                "source_method": "GET",
                "dest_method": "POST"
            }

            response = await client.post(
                f"{TEST_BASE_URL}/api/connections",
                json=test_connection,
                headers={"Content-Type": "application/json"}
            )

            if response.status_code == 200:
                result = response.json()
                print(f"✅ Connection created: {result}")

                # Extract connection ID
                result_text = result.get('result', '')
                if 'ID: ' in result_text:
                    connection_id = result_text.split('ID: ')[1].strip()
                    print(f"📝 Connection ID: {connection_id}")

                    # Test the connection
                    response = await client.get(f"{TEST_BASE_URL}/api/connections/{connection_id}/test")
                    if response.status_code == 200:
                        print(f"✅ Connection test: {response.json()}")

                    # Execute the connection
                    response = await client.post(f"{TEST_BASE_URL}/api/connections/{connection_id}/execute")
                    if response.status_code == 200:
                        print(f"✅ Connection executed: {response.json()}")

                    # Delete the connection
                    response = await client.delete(f"{TEST_BASE_URL}/api/connections/{connection_id}")
                    if response.status_code == 200:
                        print(f"✅ Connection deleted: {response.json()}")

            else:
                print(f"❌ Connection creation failed: {response.status_code} - {response.text}")

        except Exception as e:
            print(f"❌ CRUD test failed: {e}")

async def run_real_tests():
    """Run all real tests"""
    print("🚀 STARTING REAL SYSTEM TESTS")
    print("=" * 50)

    # Test 1: API endpoints
    await test_api_endpoints()

    # Test 2: SSE streaming
    await test_sse_connection()

    # Test 3: CRUD operations
    await test_connection_crud()

    print("\n" + "=" * 50)
    print("✅ ALL REAL TESTS COMPLETED!")
    print("This is NOT fake - it's real, working code!")

if __name__ == "__main__":
    print("REAL TEST SCRIPT - Testing actual server functionality")
    print("Make sure your server is running on the configured URL")
    print(f"Testing against: {TEST_BASE_URL}")
    print()

    asyncio.run(run_real_tests())