#!/usr/bin/env bash
set -e

echo "========================================================="
echo "   SnapServe Tracker - Krutrim Cloud Deployment Setup    "
echo "========================================================="

# 1. Update system packages
echo "📦 Updating system packages..."
sudo apt-get update -y && sudo apt-get upgrade -y

# 2. Install Docker if not already installed
if ! command -v docker &> /dev/null; then
    echo "🐳 Docker not found. Installing Docker & Docker Compose..."
    sudo apt-get install -y ca-certificates curl gnupg lsb-release

    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin

    sudo usermod -aG docker $USER
    echo "✅ Docker installed successfully."
else
    echo "✅ Docker is already installed."
fi

# 3. Check for .env file
if [ ! -f .env ]; then
    echo "📄 Creating .env from .env.production.example..."
    cp .env.production.example .env
    # Generate random JWT Secret
    RANDOM_JWT=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 48)
    sed -i "s/generate_a_random_long_jwt_secret_key_here_for_krutrim_prod/$RANDOM_JWT/" .env
    echo "✅ Generated secure JWT secret in .env"
fi

# 4. Pull and build containers
echo "🚀 Building and starting SnapServe services (PostgreSQL + Backend + Nginx Frontend)..."
sudo docker compose up -d --build

# 5. Show container status
echo ""
echo "📊 Current Container Status:"
sudo docker compose ps

# 6. Retrieve Public IP
PUBLIC_IP=$(curl -s ifconfig.me || echo "YOUR_SERVER_IP")

echo ""
echo "========================================================="
echo "🎉 DEPLOYMENT COMPLETE! SnapServe is live on Krutrim Cloud"
echo "========================================================="
echo "🌐 Access your app at: http://$PUBLIC_IP"
echo "API Endpoint:        http://$PUBLIC_IP/api"
echo ""
echo "Default Credentials:"
echo "  Super Admin:  superadmin@snapserve.com  /  Admin@123456"
echo "  Admin:        admin@snapserve.com       /  Admin@123456"
echo "  Employee:     rahul@snapserve.com       /  Admin@123456"
echo "========================================================="
