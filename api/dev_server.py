from http.server import HTTPServer

from solver import handler


def run():
    server = HTTPServer(("127.0.0.1", 8000), handler)
    print("[solver-dev] Listening on http://127.0.0.1:8000")
    server.serve_forever()


if __name__ == "__main__":
    run()
