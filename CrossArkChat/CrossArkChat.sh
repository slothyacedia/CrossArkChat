#!/usr/bin/env bash

# -----------------------
# Kill previous process
# -----------------------
if [ -f PID.txt ]; then
    OLD_PID=$(cat PID.txt)
    echo "Killing Old CrossArkChat.js, Instance PID $OLD_PID"
    kill -9 "$OLD_PID" 2>/dev/null
    rm -f PID.txt
fi

echo $$ > PID.txt

# -----------------------
# Variables
# -----------------------
node=0
git=0
needInstalls=0
relaunchNeeded=0
logging=0
persist=0

echo "Running Checks..."
echo

# -----------------------
# Check Node.js
# -----------------------
echo "Checking For Node.js..."
if command -v node >/dev/null 2>&1; then
    echo "Node.js Detected"
    node=1
else
    echo "Node.js Missing"
    needInstalls=1
fi
echo

# -----------------------
# Check git
# -----------------------
echo "Checking For git..."
if command -v git >/dev/null 2>&1; then
    echo "git Detected"
    git=1
else
    echo "git Missing"
    needInstalls=1
fi
echo

# -----------------------
# Install missing deps
# -----------------------
if [ "$needInstalls" -eq 1 ]; then
    echo "Some Requirements Missing, Attempting Installation..."

    if command -v apt >/dev/null 2>&1; then
        PKG_MANAGER="apt"
    elif command -v yum >/dev/null 2>&1; then
        PKG_MANAGER="yum"
    elif command -v pacman >/dev/null 2>&1; then
        PKG_MANAGER="pacman"
    else
        echo "No supported package manager found. Install Node.js and git manually."
        exit 1
    fi

    echo "Using package manager: $PKG_MANAGER"

    # Install Node.js
    if [ "$node" -eq 0 ]; then
        echo "Installing Node.js..."
        case $PKG_MANAGER in
            apt) sudo apt update && sudo apt install -y nodejs npm ;;
            yum) sudo yum install -y nodejs npm ;;
            pacman) sudo pacman -Sy --noconfirm nodejs npm ;;
        esac
        relaunchNeeded=1
        echo
    fi

    # Install git
    if [ "$git" -eq 0 ]; then
        echo "Installing git..."
        case $PKG_MANAGER in
            apt) sudo apt install -y git ;;
            yum) sudo yum install -y git ;;
            pacman) sudo pacman -Sy --noconfirm git ;;
        esac
        relaunchNeeded=1
        echo
    fi

    # Relaunch script
    if [ "$relaunchNeeded" -eq 1 ]; then
        echo "Installations Complete, Relaunching Script..."
        sleep 1
        exec "$0" "$@"
        exit 0
    fi
fi

# -----------------------
# NPM Install
# -----------------------
echo "Checking For Modules..."
if [ -d node_modules ]; then
    echo "node_modules Exists, Skipping..."
else
    if [ -f package.json ]; then
        echo "Installing Modules..."
        npm install
        echo "Modules Installed. Restart script."
        exit 0
    else
        echo "package.json Not Found, Skipping..."
    fi
fi
echo

# -----------------------
# Parse args
# -----------------------
for arg in "$@"; do
    case "$arg" in
        -p|-persist) persist=1 ;;
        -l|-logging) logging=1 ;;
    esac
done

if [ "$persist" -eq 1 ]; then
    echo "Persist Enabled..."
else
    echo "Persist Disabled..."
fi

if [ "$logging" -eq 1 ]; then
    echo "Logging Enabled..."
else
    echo "Logging Disabled..."
fi

echo
echo "Starting CrossArkChat.js..."

# -----------------------
# Run loop
# -----------------------
while true; do
    if [ "$logging" -eq 1 ]; then
        mkdir -p logs
        logFile="logs/$(date '+%y-%m-%d_%H%M').log"
        node CrossArkChat.js | tee -a "$logFile"
    else
        node CrossArkChat.js
    fi

    if [ $? -ne 0 ]; then
        echo "CrossArkChat.js Exited With Error..."
    else
        echo "CrossArkChat.js Exited Without An Error..."
    fi

    if [ "$persist" -eq 1 ]; then
        echo "Restarting..."
    else
        break
    fi
done

exit 0