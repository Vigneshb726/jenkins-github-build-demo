"""
Automated Application Build Using Jenkins and GitHub - demo dashboard backend.

The backend has two jobs:
  1. Serve the dashboard (static HTML/CSS/JS) and the sample Hello.java file.
  2. OPTIONAL: act as a secure proxy to a real Jenkins server.

Jenkins credentials are read only from environment variables (or a local .env
file) on the server. They are never sent to the browser. If they are missing,
the dashboard still works using its clearly labelled simulated demo.
"""

import base64
import json
import os
import re
from pathlib import Path
from urllib import error as urlerror
from urllib import parse, request as urlrequest

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
TIMEOUT_SECONDS = 10

app = Flask(__name__, static_folder="static", static_url_path="")


def load_dotenv(path=BASE_DIR / ".env"):
    """Tiny .env loader so students do not need an extra package."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv()


def jenkins_settings():
    return {
        "url": os.environ.get("JENKINS_URL", "").strip().rstrip("/"),
        "job": os.environ.get("JENKINS_JOB", "").strip(),
        "user": os.environ.get("JENKINS_USER", "").strip(),
        "token": os.environ.get("JENKINS_API_TOKEN", "").strip(),
    }


def jenkins_configured(settings):
    return all(settings[key] for key in ("url", "job", "user", "token"))


def job_path(job_name):
    # "Folder/Job" -> "/job/Folder/job/Job"
    return "".join("/job/" + parse.quote(part) for part in job_name.split("/") if part)


class JenkinsError(Exception):
    pass


def jenkins_call(path, method="GET"):
    """Call the Jenkins REST API using HTTP Basic auth with an API token.

    Returns (status_code, headers, body_text). API-token authentication does
    not need a CSRF crumb on modern Jenkins versions.
    """
    settings = jenkins_settings()
    if not jenkins_configured(settings):
        raise JenkinsError("Jenkins is not configured on the server.")

    req = urlrequest.Request(
        settings["url"] + path,
        method=method,
        data=b"" if method == "POST" else None,
    )
    credentials = f"{settings['user']}:{settings['token']}".encode("utf-8")
    req.add_header("Authorization", "Basic " + base64.b64encode(credentials).decode("ascii"))
    try:
        with urlrequest.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            return resp.status, resp.headers, resp.read().decode("utf-8", errors="replace")
    except urlerror.HTTPError as exc:
        if exc.code in (401, 403):
            raise JenkinsError("Jenkins rejected the credentials (HTTP %d)." % exc.code) from None
        if exc.code == 404:
            raise JenkinsError("Jenkins job or build not found (HTTP 404).") from None
        raise JenkinsError("Jenkins returned HTTP %d." % exc.code) from None
    except (urlerror.URLError, TimeoutError, OSError):
        raise JenkinsError("Cannot reach the Jenkins server at %s." % settings["url"]) from None


def error_response(exc, status=502):
    return jsonify({"ok": False, "error": str(exc)}), status


# ----------------------------------------------------------------- pages

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/sample-app/Hello.java")
def hello_java():
    return send_from_directory(BASE_DIR / "sample-app", "Hello.java", mimetype="text/plain")


# ------------------------------------------------------------------- API

@app.route("/api/status")
def status():
    """Tell the dashboard whether real Jenkins mode is available (no secrets)."""
    settings = jenkins_settings()
    configured = jenkins_configured(settings)
    result = {
        "backend": True,
        "jenkins_configured": configured,
        "jenkins_url": settings["url"] or None,
        "job_name": settings["job"] or None,
        "jenkins_reachable": None,
        "message": "Simulated demo mode: Jenkins credentials are not set on the server.",
    }
    if configured:
        try:
            jenkins_call(job_path(settings["job"]) + "/api/json?tree=name")
            result["jenkins_reachable"] = True
            result["message"] = "Connected to Jenkins job '%s'." % settings["job"]
        except JenkinsError as exc:
            result["jenkins_reachable"] = False
            result["message"] = str(exc)
    return jsonify(result)


@app.route("/api/jenkins/build", methods=["POST"])
def trigger_build():
    settings = jenkins_settings()
    try:
        _, headers, _ = jenkins_call(job_path(settings["job"]) + "/build", method="POST")
    except JenkinsError as exc:
        return error_response(exc, 503 if not jenkins_configured(settings) else 502)
    match = re.search(r"/queue/item/(\d+)", headers.get("Location", ""))
    if not match:
        return error_response(JenkinsError("Jenkins did not return a queue item."))
    return jsonify({"ok": True, "queue_id": int(match.group(1))}), 202


@app.route("/api/jenkins/queue/<int:queue_id>")
def queue_item(queue_id):
    try:
        _, _, body = jenkins_call("/queue/item/%d/api/json" % queue_id)
    except JenkinsError as exc:
        return error_response(exc)
    data = json.loads(body)
    executable = data.get("executable") or {}
    return jsonify({
        "ok": True,
        "cancelled": bool(data.get("cancelled")),
        "why": data.get("why"),
        "build_number": executable.get("number"),
    })


@app.route("/api/jenkins/builds/<int:number>")
def build_info(number):
    settings = jenkins_settings()
    path = job_path(settings["job"]) + "/%d/api/json?tree=number,building,result,duration,timestamp" % number
    try:
        _, _, body = jenkins_call(path)
    except JenkinsError as exc:
        return error_response(exc)
    data = json.loads(body)
    data["ok"] = True
    return jsonify(data)


@app.route("/api/jenkins/builds/<int:number>/log")
def build_log(number):
    settings = jenkins_settings()
    start = request.args.get("start", "0")
    if not start.isdigit():
        start = "0"
    path = job_path(settings["job"]) + "/%d/logText/progressiveText?start=%s" % (number, start)
    try:
        _, headers, body = jenkins_call(path)
    except JenkinsError as exc:
        return error_response(exc)
    return jsonify({
        "ok": True,
        "text": body,
        "next": int(headers.get("X-Text-Size", start) or start),
        "more": headers.get("X-More-Data", "false").lower() == "true",
    })


if __name__ == "__main__":
    mode = "REAL Jenkins proxy" if jenkins_configured(jenkins_settings()) else "simulated demo"
    print(" * Jenkins x GitHub build dashboard (%s)" % mode)
    print(" * Open http://127.0.0.1:5000 in your browser")
    app.run(host="127.0.0.1", port=5000, debug=False)
