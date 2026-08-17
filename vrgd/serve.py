#!/usr/bin/env python3
"""
Static dev server with HTTP Range support.

`python3 -m http.server` ignores the Range header and always answers 200 with
the whole file. A <video> served that way reports seekable = [0, 0], so
scroll-scrubbing the hero silently does nothing — currentTime refuses to move
even though the file is fully buffered.

GitHub Pages does support Range, so this only matters locally.

    python3 serve.py [port] [directory]
"""

import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


class RangeHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        # Dev server: never let the browser cache, so edits show up on reload.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()

        match = RANGE_RE.fullmatch(rng.strip())
        if not match:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()

        try:
            size = os.path.getsize(path)
            handle = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        start_raw, end_raw = match.group(1), match.group(2)
        if start_raw:
            start = int(start_raw)
            end = int(end_raw) if end_raw else size - 1
        else:
            # Suffix form: "bytes=-500" means the final 500 bytes.
            if not end_raw:
                handle.close()
                self.send_error(400, "Malformed Range")
                return None
            start = max(0, size - int(end_raw))
            end = size - 1

        if start >= size:
            handle.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        end = min(end, size - 1)
        length = end - start + 1

        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(length))
        self.end_headers()

        handle.seek(start)
        self._remaining = length
        return _Limited(handle, length)

    def copyfile(self, source, outputfile):
        # Range responses hand back a size-limited reader.
        if isinstance(source, _Limited):
            while True:
                chunk = source.read(64 * 1024)
                if not chunk:
                    break
                try:
                    outputfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    break
            source.close()
            return
        try:
            super().copyfile(source, outputfile)
        except (BrokenPipeError, ConnectionResetError):
            pass


class _Limited:
    """Reads at most `length` bytes from an open file handle."""

    def __init__(self, handle, length):
        self.handle = handle
        self.remaining = length

    def read(self, n=-1):
        if self.remaining <= 0:
            return b""
        if n < 0 or n > self.remaining:
            n = self.remaining
        data = self.handle.read(n)
        self.remaining -= len(data)
        return data

    def close(self):
        self.handle.close()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3336
    directory = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(__file__))
    handler = partial(RangeHandler, directory=directory)
    print(f"serving {directory} on http://localhost:{port} (Range enabled)")
    ThreadingHTTPServer(("", port), handler).serve_forever()


if __name__ == "__main__":
    main()
