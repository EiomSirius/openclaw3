#!/usr/bin/env python3
"""
AMOS Stealer Honeypot C2
Captures exfiltrated data from infected hosts
"""

from flask import Flask, request, jsonify
from datetime import datetime
import os
import json
import hashlib

app = Flask(__name__)

# Storage for captured data
CAPTURE_DIR = "/home/lj/malware-analysis/clawhavoc/honeypot/captured"
os.makedirs(CAPTURE_DIR, exist_ok=True)

def log_request(endpoint, data, files=None):
    """Log all incoming requests with full details"""
    timestamp = datetime.utcnow().isoformat()
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'unknown')
    
    # Create unique capture ID
    capture_id = hashlib.md5(f"{timestamp}{client_ip}".encode()).hexdigest()[:12]
    capture_path = os.path.join(CAPTURE_DIR, capture_id)
    os.makedirs(capture_path, exist_ok=True)
    
    # Log metadata
    meta = {
        "timestamp": timestamp,
        "client_ip": client_ip,
        "user_agent": user_agent,
        "endpoint": endpoint,
        "method": request.method,
        "headers": dict(request.headers),
        "args": dict(request.args),
        "form": dict(request.form) if request.form else None,
    }
    
    with open(os.path.join(capture_path, "metadata.json"), "w") as f:
        json.dump(meta, f, indent=2)
    
    # Save raw body
    if data:
        with open(os.path.join(capture_path, "body.bin"), "wb") as f:
            f.write(data)
    
    # Save uploaded files
    if files:
        for name, file_data in files.items():
            safe_name = "".join(c for c in name if c.isalnum() or c in "._-")
            with open(os.path.join(capture_path, f"file_{safe_name}"), "wb") as f:
                f.write(file_data)
    
    print(f"[{timestamp}] CAPTURED from {client_ip}: {endpoint} -> {capture_path}")
    return capture_id

# Main exfil endpoint - mimics AMOS /api/rep
@app.route('/api/rep', methods=['GET', 'POST'])
def api_rep():
    data = request.get_data()
    files = {}
    
    # Handle multipart file uploads
    for key in request.files:
        files[key] = request.files[key].read()
    
    capture_id = log_request("/api/rep", data, files)
    
    # Return success to keep malware happy
    return jsonify({"status": "ok", "id": capture_id})

# Payload download endpoint - serves tracking beacon
@app.route('/api/dow', methods=['GET', 'POST'])
def api_dow():
    log_request("/api/dow", request.get_data())
    # Return empty or tracking payload
    return b""

# Catch-all for any other endpoints
@app.route('/<path:path>', methods=['GET', 'POST', 'PUT'])
def catch_all(path):
    data = request.get_data()
    files = {}
    for key in request.files:
        files[key] = request.files[key].read()
    
    log_request(f"/{path}", data, files)
    
    # For payload requests, check if we have the real payload to serve
    payload_path = f"/home/lj/malware-analysis/clawhavoc/payloads/{path}"
    if os.path.exists(payload_path):
        with open(payload_path, "rb") as f:
            return f.read()
    
    return jsonify({"status": "ok"})

@app.route('/', methods=['GET'])
def index():
    return "Apache2 Ubuntu Default Page: It works", 200

if __name__ == '__main__':
    print("=" * 60)
    print("AMOS STEALER HONEYPOT C2")
    print(f"Capture directory: {CAPTURE_DIR}")
    print("=" * 60)
    app.run(host='0.0.0.0', port=9090, debug=False)
