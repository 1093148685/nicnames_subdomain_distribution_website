"""
ReactBits DNS - Combined server: serves static frontend + proxies /api to dnsportal backend.
Usage: python serve.py
"""
import os
import json
import http.client
import sys
import signal
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), 'dist')
BACKEND_HOST = 'localhost'
BACKEND_PORT = 8096
PORT = int(os.environ.get('PORT', '8097'))

MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
}

class SafeHandler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *args, **kwargs):
        try:
            super().__init__(*args, directory=FRONTEND_DIR, **kwargs)
        except (BrokenPipeError, ConnectionResetError, OSError):
            return

    def _safe_send(self, fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except (BrokenPipeError, ConnectionResetError, OSError):
            return None

    def do_GET(self):
        self._dispatch('GET')
    def do_POST(self):
        self._dispatch('POST')
    def do_DELETE(self):
        self._dispatch('DELETE')
    def do_PUT(self):
        self._dispatch('PUT')
    def do_HEAD(self):
        self._dispatch('HEAD')

    def _dispatch(self, method):
        try:
            if self.path.startswith('/api/'):
                self._proxy(method)
            else:
                self._serve_static()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def _proxy(self, method):
        path = self.path
        conn = http.client.HTTPConnection(BACKEND_HOST, BACKEND_PORT, timeout=30)
        body = None
        content_length = self.headers.get('Content-Length')
        if content_length and int(content_length) > 0:
            try:
                body = self.rfile.read(int(content_length))
            except (BrokenPipeError, ConnectionResetError, OSError):
                conn.close()
                return

        fwd_headers = {}
        for key in ('Content-Type', 'Authorization', 'Cookie', 'User-Agent', 'Accept', 'Origin', 'Referer'):
            val = self.headers.get(key)
            if val:
                fwd_headers[key] = val
        fwd_headers['X-Real-IP'] = self.client_address[0]
        fwd_headers['X-Forwarded-For'] = self.headers.get('X-Forwarded-For', self.client_address[0])
        fwd_headers['X-Forwarded-Proto'] = 'https'
        fwd_headers['Host'] = 'localhost:8096'

        try:
            conn.request(method, path, body=body, headers=fwd_headers)
            resp = conn.getresponse()
            data = resp.read()

            self._safe_send(self.send_response, resp.status)
            skip_keys = {'transfer-encoding', 'connection', 'content-encoding', 'date', 'server', 'content-length'}
            for key, val in resp.getheaders():
                if key.lower() in skip_keys:
                    continue
                if key.lower() in ('content-type', 'set-cookie', 'cache-control', 'location'):
                    self._safe_send(self.send_header, key, val)
            self._safe_send(self.send_header, 'Content-Length', len(data))
            self._safe_send(self.end_headers)
            self._safe_send(self.wfile.write, data)
            self._safe_send(self.wfile.flush)
        except Exception:
            pass
        finally:
            conn.close()

    def _serve_static(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == '/' or path == '':
            path = '/index.html'
        full_path = os.path.join(FRONTEND_DIR, path.lstrip('/'))
        if not os.path.exists(full_path) or not os.path.isfile(full_path):
            full_path = os.path.join(FRONTEND_DIR, 'index.html')
            if not os.path.exists(full_path):
                self._safe_send(self.send_response, 404)
                self._safe_send(self.end_headers)
                return
        ext = os.path.splitext(full_path)[1].lower()
        try:
            with open(full_path, 'rb') as f:
                data = f.read()
            self._safe_send(self.send_response, 200)
            self._safe_send(self.send_header, 'Content-Type', MIME_TYPES.get(ext, 'application/octet-stream'))
            self._safe_send(self.send_header, 'Content-Length', len(data))
            self._safe_send(self.send_header, 'Cache-Control', 'no-cache, no-store, must-revalidate')
            self._safe_send(self.end_headers)
            self._safe_send(self.wfile.write, data)
            self._safe_send(self.wfile.flush)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def log_message(self, format, *args):
        try:
            method = args[0] if len(args) > 0 else '?'
            path = args[1] if len(args) > 1 else '?'
            status = args[2] if len(args) > 2 else '?'
            print(f"[{self.client_address[0]}] {method} {path} {status}")
        except Exception:
            print(f"[log] {' '.join(str(a) for a in args)}")


class RobustHTTPServer(HTTPServer):
    """HTTPServer that never crashes on client disconnection."""
    allow_reuse_address = True

    def process_request(self, request, client_address):
        """Override: catch all exceptions during request handling."""
        try:
            self.finish_request(request, client_address)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        except Exception:
            pass
        finally:
            self.shutdown_request(request)


if __name__ == '__main__':
    os.makedirs(FRONTEND_DIR, exist_ok=True)
    # Ignore SIGCHLD to prevent zombie processes
    signal.signal(signal.SIGCHLD, signal.SIG_IGN)
    server = RobustHTTPServer(('0.0.0.0', PORT), SafeHandler)
    print(f"ReactBits DNS server running on http://0.0.0.0:{PORT}")
    print(f"    Frontend: http://localhost:{PORT}")
    print(f"    API proxy: http://localhost:{PORT}/api/ -> http://{BACKEND_HOST}:{BACKEND_PORT}")
    server.serve_forever()
