# Cloud deployment

This project can run on any Ubuntu cloud server with Docker.

## Server requirements

- Ubuntu 22.04 or 24.04
- 1 vCPU / 1 GB RAM is enough
- Open firewall ports 80 and 443
- Optional: a domain pointing to the server IP

## Fast path

Upload this folder to the server, then run:

```bash
cd vocab-coach
sudo bash deploy/ubuntu-deploy.sh
```

This starts the site on plain HTTP through Caddy:

```text
http://YOUR_SERVER_IP
```

## With a domain and HTTPS

Point your domain A record to the server IP first, then run:

```bash
cd vocab-coach
sudo SITE_ADDRESS=vocab.example.com bash deploy/ubuntu-deploy.sh
```

Caddy will request and renew HTTPS certificates automatically.

## API keys

There are two choices:

- Leave server keys empty and enter OpenAI/DeepSeek keys in the website Settings page.
- Put server-wide keys in `/opt/vocab-coach/.env`:

```env
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
```

Then restart:

```bash
cd /opt/vocab-coach
sudo docker compose up -d
```

## Operations

```bash
cd /opt/vocab-coach
sudo docker compose ps
sudo docker compose logs -f
sudo docker compose restart
sudo docker compose pull
sudo docker compose up -d --build
```

## Update deployment

Upload the new project files to the server and run the same deploy command again:

```bash
sudo SITE_ADDRESS=vocab.example.com bash deploy/ubuntu-deploy.sh
```

The script keeps the existing `/opt/vocab-coach/.env` file.
