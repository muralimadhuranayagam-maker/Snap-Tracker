# Complete Guide: Deploying SnapServe to Krutrim Cloud with PostgreSQL

This guide walks you step-by-step from scratch through launching a compute instance on **Krutrim Cloud**, configuring the environment, and deploying **SnapServe** (Node.js backend + Nginx frontend + PostgreSQL database).

---

## 🏗️ Architecture on Krutrim Cloud

```
                         [ Internet / User Browser ]
                                     │
                                     ▼
                      ┌──────────────────────────────┐
                      │  Krutrim Cloud Compute VM    │
                      │  (Ubuntu 22.04 LTS)          │
                      │  Public IP: e.g. 15.206.x.x  │
                      └──────────────┬───────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌─────────────────────┐                             ┌─────────────────────┐
│  Frontend (Nginx)   │ ──── API Proxy (/api) ────> │  Backend (Node.js)  │
│  Port: 80 / 443     │ <─── WebSocket (/ws) ────── │  Port: 4000         │
└─────────────────────┘                             └──────────┬──────────┘
                                                               │
                                                               ▼
                                                    ┌─────────────────────┐
                                                    │ PostgreSQL 16 DB    │
                                                    │ Persistent Volume   │
                                                    └─────────────────────┘
```

---

## 📋 Prerequisites
1. An active account on [Krutrim Cloud](https://cloud.olakrutrim.com/).
2. An SSH client (PowerShell, Command Prompt, or Terminal).
3. Your Git repository URL or project files.

---

## 🚀 Step 1: Launch a Compute Instance on Krutrim Cloud

1. Log in to [Krutrim Cloud Console](https://cloud.olakrutrim.com/).
2. Navigate to **Compute** -> **Instances** (or **Virtual Machines**).
3. Click **Create Instance** / **Launch Instance**:
   - **Name**: `snapserve-production`
   - **Image / OS**: `Ubuntu 22.04 LTS` (64-bit x86)
   - **Flavor / Size**: Select a standard CPU instance:
     - Minimum: `2 vCPU, 4 GB RAM`
     - Recommended: `4 vCPU, 8 GB RAM`
   - **Storage**: At least `30 GB SSD` root volume.
   - **SSH Key Pair**:
     - Select your existing SSH key OR click **Create New Key Pair**.
     - If creating a new key, download the `.pem` file to your computer (e.g. `C:\Users\91967\.ssh\krutrim-key.pem`).
4. **Firewall / Security Group Rules**:
   Ensure inbound rules allow:
   | Port | Protocol | Source | Description |
   | :--- | :--- | :--- | :--- |
   | **22** | TCP | `0.0.0.0/0` (or your IP) | SSH Access |
   | **80** | TCP | `0.0.0.0/0` | Web HTTP Traffic |
   | **443** | TCP | `0.0.0.0/0` | Web HTTPS (SSL) |
   | **4000** | TCP | `0.0.0.0/0` | (Optional direct API / WebSocket) |
5. Click **Launch / Create** and wait 1–2 minutes for the status to show **Running**.
6. Note down the **Public IP** assigned to your instance (e.g. `15.206.54.120`).

---

## 🔑 Step 2: Connect to your Krutrim VM via SSH

Open your terminal or PowerShell on your local machine:

```bash
# If using a downloaded .pem key on Windows/Linux:
ssh -i "path/to/krutrim-key.pem" ubuntu@<YOUR_KRUTRIM_PUBLIC_IP>
```

> **Windows Tip**: If you get a "Permissions 0644 are too open" error for your key on Windows, run:
> ```powershell
> icacls "path\to\krutrim-key.pem" /inheritance:r
> icacls "path\to\krutrim-key.pem" /grant:r "$($env:USERNAME):(R)"
> ```

---

## 📦 Step 3: Transfer or Clone the Project on the VM

Once connected to your Krutrim VM:

### Option A: Clone with Git (Recommended)
```bash
git clone <YOUR_GIT_REPO_URL> snapserve
cd snapserve
```

### Option B: Copy Files from Local PC using SCP
From your local Windows command line:
```powershell
scp -i "path\to\krutrim-key.pem" -r "c:\Users\91967\Documents\Snap-Tracker\Snap-Tracker" ubuntu@<YOUR_KRUTRIM_PUBLIC_IP>:~/snapserve
```
Then on the VM:
```bash
cd ~/snapserve
```

---

## ⚡ Step 4: Run the Automated Deployment Script

We have provided an automated deployment script `deploy-krutrim.sh` that automatically installs Docker, configures environment variables, builds the frontend and backend, sets up PostgreSQL, and runs Prisma migrations/seeds.

Run this command inside the `snapserve` folder:

```bash
chmod +x deploy-krutrim.sh
./deploy-krutrim.sh
```

### What `deploy-krutrim.sh` does automatically:
1. Installs **Docker** & **Docker Compose** on Ubuntu.
2. Generates a secure `.env` file with a strong random JWT secret.
3. Launches **PostgreSQL 16** container with persistent disk volume.
4. Builds the **Node.js API backend** container, generates Prisma Client, runs `prisma db push` on PostgreSQL, and executes `npm run db:seed`.
5. Builds the **React Vite frontend** container and configures **Nginx** reverse proxy.
6. Opens port 80 for public access.

---

## 🌐 Step 5: Access SnapServe in your Browser

Once the script completes, open your browser and navigate to:

```
http://<YOUR_KRUTRIM_PUBLIC_IP>
```

### Default Login Accounts:
- **Super Admin**: `superadmin@snapserve.com` / `Admin@123456`
- **Admin**: `admin@snapserve.com` / `Admin@123456`
- **Employee**: `rahul@snapserve.com` / `Admin@123456`

---

## 🛠️ Useful Management Commands on the VM

Run these inside the `snapserve` directory:

```bash
# View live logs of all services
sudo docker compose logs -f

# View live logs of backend only
sudo docker compose logs -f backend

# View live logs of database
sudo docker compose logs -f db

# Restart all services
sudo docker compose restart

# Stop all services
sudo docker compose down

# Start all services
sudo docker compose up -d

# Direct access to PostgreSQL CLI
sudo docker compose exec db psql -U snapserve -d snapserve
```

---

## 🔒 Step 6 (Optional): Enable Free HTTPS (SSL) with Let's Encrypt

If you point a domain (e.g. `app.yourcompany.com`) to your Krutrim Public IP via an **A Record** in your DNS:

1. Install Certbot on the VM:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   ```
2. Generate free SSL certificate:
   ```bash
   sudo certbot certonly --standalone -d app.yourcompany.com
   ```
3. Update `frontend/nginx.conf` with SSL certificates or use Nginx on the host to terminate SSL.
