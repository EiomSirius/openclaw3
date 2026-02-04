from http.server import HTTPServer, BaseHTTPRequestHandler
import json, os
from datetime import datetime

class C2Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(length)
        
        # Save capture
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        with open(f"captured/{ts}.bin", "wb") as f:
            f.write(data)
        with open(f"captured/{ts}.meta", "w") as f:
            f.write(f"Path: {self.path}\nIP: {self.client_address[0]}\n")
        
        print(f"[CAPTURED] {self.path} - {length} bytes from {self.client_address[0]}")
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')
    
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'OK')

print("C2 Honeypot starting on :9090")
HTTPServer(('0.0.0.0', 9090), C2Handler).serve_forever()
