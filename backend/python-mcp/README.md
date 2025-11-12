# HTTP Connection Manager - MCP Server

A Model Context Protocol (MCP) server for managing HTTP connections between endpoints with database persistence.

## Features

- Create and manage HTTP connections between source and destination endpoints
- Execute HTTP requests with data transformation
- Track execution statistics and logs
- Persistent storage using PostgreSQL (NEON)

## Prerequisites

- Python 3.12 or higher
- PostgreSQL database (NEON recommended)
- `uv` package manager (recommended) or `pip`

## Installation

### Option 1: Using uv (Recommended)

[uv](https://github.com/astral-sh/uv) is a fast Python package installer and resolver.

```bash
# Install uv if you haven't already
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
uv sync
```

### Option 2: Using pip

```bash
# Create a virtual environment
python -m venv .venv

# Activate the virtual environment
# On Linux/macOS:
source .venv/bin/activate
# On Windows:
# .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

To generate requirements.txt from pyproject.toml (if needed):
```bash
uv pip compile pyproject.toml -o requirements.txt
```

## Configuration

### Environment Variables

Create a `.env` file in this directory with the following configuration:

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` and set your database connection:

```
DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require
```

**Required Environment Variables:**
- `DATABASE_URL`: PostgreSQL connection string for NEON database

### Database Setup

The server will automatically create the required tables on first run:
- `connections`: Stores HTTP connection configurations
- `execution_logs`: Stores execution history and statistics

## Running the Server

### Using uv

```bash
uv run python server.py
```

### Using pip (with virtual environment activated)

```bash
python server.py
```

The server will:
1. Initialize the database tables if they don't exist
2. Start the MCP server on stdio transport
3. Register the following tools:
   - `create_connection`: Create a new HTTP connection
   - `list_connections`: List all configured connections
   - `execute_connection`: Execute an HTTP connection
   - `delete_connection`: Delete a connection

## MCP Tools

### create_connection

Create a new HTTP connection between endpoints.

**Parameters:**
- `name` (string): Human-readable name for the connection
- `source_url` (string): URL to fetch data from
- `dest_url` (string): URL to send data to
- `source_method` (string, optional): HTTP method for source (default: "GET")
- `dest_method` (string, optional): HTTP method for destination (default: "POST")
- `source_headers` (string, optional): JSON string of headers for source request
- `dest_headers` (string, optional): JSON string of headers for destination request

**Returns:** Connection ID

### list_connections

List all configured HTTP connections.

**Returns:** Formatted list of connections with IDs, names, and endpoints

### execute_connection

Execute an HTTP connection to transfer data.

**Parameters:**
- `connection_id` (string): The ID of the connection to execute

**Returns:** Execution result with status codes

### delete_connection

Delete an HTTP connection.

**Parameters:**
- `connection_id` (string): The ID of the connection to delete

**Returns:** Confirmation message

## Testing

A test client is provided to verify the MCP server functionality:

```bash
# Using uv
uv run python mcp_test_client.py

# Using pip
python mcp_test_client.py
```

The test client will:
1. Start the MCP server
2. Test initialization
3. List available tools
4. Create a test connection
5. Execute the connection
6. Clean up

## Project Structure

```
backend/python-mcp/
├── server.py           # Main MCP server implementation
├── main.py            # Simple entry point (legacy)
├── mcp_test_client.py # Test client for the MCP server
├── pyproject.toml     # Project dependencies and metadata
├── uv.lock           # Lock file for uv package manager
├── .env              # Environment configuration (not in git)
├── .env.example      # Example environment configuration
├── .gitignore        # Git ignore patterns
├── .python-version   # Python version specification
└── README.md         # This file
```

## Dependencies

- `httpx`: Async HTTP client for making requests
- `mcp[cli]`: Model Context Protocol SDK
- `psycopg2`: PostgreSQL adapter
- `fastapi`: Web framework (for future API endpoints)
- `uvicorn`: ASGI server
- `python-dotenv`: Environment variable management

## Troubleshooting

### Database Connection Issues

If you encounter database connection errors:
1. Verify your `DATABASE_URL` is correct in `.env`
2. Check that your NEON database is accessible
3. Ensure SSL mode is set to `require` in the connection string

### Import Errors

If you get import errors:
1. Make sure you've installed dependencies: `uv sync` or `pip install -r requirements.txt`
2. Verify you're using Python 3.12 or higher: `python --version`

### MCP Server Not Starting

1. Check that port 5000 is not already in use
2. Verify all environment variables are set correctly
3. Check server.py for any error messages in the console

## Development

To modify the server:

1. Edit `server.py` to add new tools or modify existing ones
2. Test changes with `mcp_test_client.py`
3. Update this README with any new features or configuration changes

## License

See the main repository LICENSE file.
