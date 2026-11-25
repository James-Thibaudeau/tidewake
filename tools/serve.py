#!/usr/bin/env python3
"""Static dev server for Tidewake: serves the repo root with caching off.

    python3 tools/serve.py [port] [directory]

The port comes from the first argument, else $PORT, else 8767. The directory
defaults to the checkout this script lives in, so it works unchanged from a
git worktree.
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


def main():
    port = int(sys.argv[1] if len(sys.argv) > 1 else os.environ.get('PORT', 8767))
    directory = sys.argv[2] if len(sys.argv) > 2 else ROOT
    handler = functools.partial(Handler, directory=directory)
    http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()


if __name__ == '__main__':
    main()
