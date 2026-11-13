"""Tiny local stand-in for the Firebase Auth + Firestore REST calls Clarea uses (testing only)."""
import json, sys, uuid, re
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

USERS = {}    # email -> {pw, uid}
TOKENS = {}   # id/refresh token -> uid
REVOKED = set()   # tokens ended by a password change
DOCS = {}     # full doc name -> {fields}
LOG = []

def P(x): return datetime.fromisoformat(x.replace("Z", "+00:00"))
def now(): return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

class H(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    def out(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.cors(); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
    def err(self, code, msg): self.out(code, {"error": {"code": code, "message": msg}})
    def do_OPTIONS(self): self.send_response(204); self.cors(); self.end_headers()
    def log_message(self, *a): pass
    def auth_uid(self):
        h = self.headers.get("Authorization", "")
        return TOKENS.get(h[7:]) if h.startswith("Bearer ") else None
    def revoke(self, uid):
        for t in [t for t, v in TOKENS.items() if v == uid]: del TOKENS[t]; REVOKED.add(t)
    def tokens(self, uid):
        it, rt = "it-" + uuid.uuid4().hex, "rt-" + uuid.uuid4().hex
        TOKENS[it] = uid; TOKENS[rt] = uid
        return it, rt
    def do_GET(self):
        if self.path == "/debug": return self.out(200, {"users": USERS, "docs": DOCS, "log": LOG[-40:]})
        self.err(404, "NOT_FOUND")
    def do_POST(self):
        u = urlparse(self.path); n = int(self.headers.get("Content-Length") or 0); raw = self.rfile.read(n).decode()
        LOG.append(u.path)
        # the admin API the Clarea server uses with a recovery code (local tests: the account by uid, or «uid-<user>»)
        ma = re.match(r"^/v1/projects/[^/]+/accounts:update$", u.path)
        if ma:
            b = json.loads(raw); lid = b.get("localId", "")
            e = next((k for k, v in USERS.items() if v["uid"] == lid or "uid-" + k.split("@")[0] == lid), None)
            if not e: return self.err(400, "USER_NOT_FOUND")
            if "password" in b: USERS[e]["pw"] = b["password"]
            self.revoke(USERS[e]["uid"])   # a new password or «validSince»: the sessions so far end
            return self.out(200, {"localId": USERS[e]["uid"]})
        if u.path.startswith("/v1/accounts:"):
            kind = u.path.split(":")[1]; b = json.loads(raw); e, pw = b.get("email", "x@y.z"), b.get("password", "")
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e): return self.err(400, "INVALID_EMAIL")
            if kind == "signUp":
                if e in USERS: return self.err(400, "EMAIL_EXISTS")
                if len(pw) < 6: return self.err(400, "WEAK_PASSWORD : Password should be at least 6 characters")
                USERS[e] = {"pw": pw, "uid": uuid.uuid4().hex[:20]}
            elif kind == "delete":
                uid = TOKENS.get(json.loads(raw).get("idToken"))
                if not uid: return self.err(400, "INVALID_ID_TOKEN")
                for k in [k for k, v in USERS.items() if v["uid"] == uid]: del USERS[k]
                return self.out(200, {"kind": "identitytoolkit#DeleteAccountResponse"})
            elif kind == "update":   # a new password: the other sessions of the account end (like Firebase)
                uid = TOKENS.get(b.get("idToken"))
                if not uid: return self.err(400, "INVALID_ID_TOKEN")
                if len(pw) < 6: return self.err(400, "WEAK_PASSWORD : Password should be at least 6 characters")
                for k, v in USERS.items():
                    if v["uid"] == uid: v["pw"] = pw; e = k
                self.revoke(uid); it, rt = self.tokens(uid)
                return self.out(200, {"localId": uid, "idToken": it, "refreshToken": rt, "expiresIn": "3600", "email": e})
            elif kind == "signInWithPassword":
                if e not in USERS or USERS[e]["pw"] != pw: return self.err(400, "INVALID_LOGIN_CREDENTIALS")
            uid = USERS[e]["uid"]; it, rt = self.tokens(uid)
            return self.out(200, {"localId": uid, "idToken": it, "refreshToken": rt, "expiresIn": "3600", "email": e})
        if u.path == "/v1/token":
            q = parse_qs(raw); rt = q.get("refresh_token", [""])[0]
            if rt in REVOKED: return self.err(400, "TOKEN_EXPIRED")
            if rt not in TOKENS: return self.err(400, "INVALID_REFRESH_TOKEN")
            uid = TOKENS[rt]
            if not any(v["uid"] == uid for v in USERS.values()): return self.err(400, "USER_NOT_FOUND")
            it, rt2 = self.tokens(uid)
            return self.out(200, {"id_token": it, "refresh_token": rt2, "expires_in": "3600", "user_id": uid})
        uid = self.auth_uid()
        m = re.match(r"^/v1/(projects/[^/]+/databases/\(default\)/documents)(.*)$", u.path)
        if not m: return self.err(404, "NOT_FOUND")
        base, rest = m.group(1), m.group(2)
        if rest == ":commit":
            b = json.loads(raw); ts = now()
            for w in b["writes"]:
                name = unquote((w.get("update") or {}).get("name") or w.get("delete"))
                owner = name.split("/users/")[1].split("/")[0]
                if owner != uid: return self.err(403, "PERMISSION_DENIED")
            for w in b["writes"]:
                if "delete" in w: DOCS.pop(unquote(w["delete"]), None); continue
                name = unquote(w["update"]["name"]); f = dict(w["update"]["fields"])
                for t in w.get("updateTransforms", []): f[t["fieldPath"]] = {"timestampValue": ts}
                DOCS[name] = {"name": name, "fields": f}
            return self.out(200, {"commitTime": ts, "writeResults": [{} for _ in b["writes"]]})
        m2 = re.match(r"^/users/([^/:]+):runQuery$", rest)
        if m2:
            if m2.group(1) != uid: return self.err(403, "PERMISSION_DENIED")
            q = json.loads(raw)["structuredQuery"]; pre = base + "/users/" + uid + "/data/"
            since = q.get("where", {}).get("fieldFilter", {}).get("value", {}).get("timestampValue")
            rows = [{"document": d, "readTime": now()} for k, d in DOCS.items() if k.startswith(pre) and (not since or P(d["fields"]["s"]["timestampValue"]) > P(since))]
            return self.out(200, rows or [{"readTime": now()}])
        self.err(404, "NOT_FOUND")

ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 9199), H).serve_forever()
