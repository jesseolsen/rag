# Starting the Server

Use the `start-server.sh` script to easily start or restart the server.

## Quick Start

```bash
./start-server.sh --docker
```

Or locally (requires Python 3.10+):

```bash
./start-server.sh
```

## Options

### Docker (Recommended)

```bash
./start-server.sh --docker
```

**Requirements:**
- Docker and Docker Compose installed
- ~2GB free disk space for containers

**What it does:**
- Stops any existing containers
- Starts PostgreSQL and the API service
- Waits for the API to be ready
- Displays the server URL when ready

**Access:** `http://localhost:8000`

### Local Development

```bash
./start-server.sh
```

**Requirements:**
- Python 3.10 or higher
- Dependencies installed from `requirements.txt`

**What it does:**
- Creates a virtual environment if needed
- Installs/updates dependencies
- Starts the uvicorn server with auto-reload

**Access:** `http://localhost:8000`

**Install Python 3.10+ on Mac:**

```bash
brew install python@3.12
```

Or use [pyenv](https://github.com/pyenv/pyenv):

```bash
brew install pyenv
pyenv install 3.12.0
pyenv local 3.12.0
```

## Troubleshooting

### "Python 3.10+ required"

Your system Python is too old. Either:
1. Install a newer Python version (see above)
2. Use Docker: `./start-server.sh --docker`

### "Docker is not installed"

Install Docker Desktop from https://www.docker.com/products/docker-desktop

### Server won't start

Check the logs:
- **Local:** Look at the output in the terminal
- **Docker:** `docker-compose logs api`

### Port 8000 already in use

Kill the existing process:

```bash
lsof -ti:8000 | xargs kill -9
```

Or use a different port:

```bash
./venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

## Status Indicator

The frontend shows a status light in the top-right corner:
- **Green:** Server is running
- **Grey:** Server is offline (click for startup instructions)

## Development Tips

- Server auto-reloads when you change Python files
- Chrome extension connects to `http://localhost:8000`
- Google Sheets integration requires credentials (see `.env` setup)
