/* =========================================================
   BuildLab - Jenkins x GitHub demo dashboard
   - Simulated demo build (runs entirely in the browser)
   - Optional real Jenkins build through the Flask backend
   ========================================================= */
(function () {
  "use strict";

  // ---------------------------------------------------------- constants
  const DEFAULT_CONFIG = {
    repoUrl: "https://github.com/Vigneshb726/jenkins-github-build-demo.git",
    branch: "main",
    jenkinsUrl: "http://localhost:8080",
    jobName: "Hello-Java-Build",
  };

  const HELLO_JAVA_FALLBACK = [
    "public class Hello {",
    "    public static void main(String[] args) {",
    '        System.out.println("Hello, Jenkins!");',
    "    }",
    "}",
  ].join("\n");

  const ICONS = {
    github: '<svg viewBox="0 0 24 24"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.5 6.4-7A5.4 5.4 0 0 0 20 4.8 5 5 0 0 0 19.9 1S18.7.6 16 2.5a13.4 13.4 0 0 0-7 0C6.3.6 5.1 1 5.1 1A5 5 0 0 0 5 4.8a5.4 5.4 0 0 0-1.5 3.7c0 5.4 3.3 6.6 6.4 7a3.4 3.4 0 0 0-.9 2.6V22"/></svg>',
    checkout: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    start: '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>',
    compile: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/></svg>',
    run: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></svg>',
    result: '<svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
    cross: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    spinner: '<svg viewBox="0 0 24 24" class="spin"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>',
    successBig: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
    failBig: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  };

  const STAGES = [
    { id: "repo", name: "GitHub Repository", icon: "github" },
    { id: "checkout", name: "Source Code Checkout", icon: "checkout" },
    { id: "start", name: "Build Started", icon: "start" },
    { id: "compile", name: "Compile Java Application", icon: "compile" },
    { id: "run", name: "Execute Application", icon: "run" },
    { id: "result", name: "Build Success or Failure", icon: "result" },
  ];

  const STATUS_LABEL = { pending: "Pending", running: "Running", success: "Success", failed: "Failed", skipped: "Skipped" };

  // ---------------------------------------------------------- helpers
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const clockTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const formatDate = (ts) => new Date(ts).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const formatDuration = (ms) => (ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);
  const randomHex = (len) => Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join("");

  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    },
  };

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      area.remove();
      return ok;
    }
  }

  function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    const icon = type === "success" ? ICONS.check : type === "failed" ? ICONS.cross : ICONS.start;
    el.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    $("toasts").appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 300);
    }, 3800);
  }

  // ---------------------------------------------------------- state
  const state = {
    config: Object.assign({}, DEFAULT_CONFIG, storage.get("buildlab.config", {})),
    history: storage.get("buildlab.history", []),
    running: false,
    runToken: 0,
    backend: null, // result of /api/status, or null when no backend
  };

  // ---------------------------------------------------------- pipeline view
  function renderStages() {
    $("stages").innerHTML = STAGES.map((s, i) => `
      <li class="stage" id="stage-${s.id}" data-status="pending">
        <div class="stage-icon">${ICONS[s.icon]}</div>
        <div class="stage-num">Stage ${i + 1}</div>
        <div class="stage-name">${s.name}</div>
        <span class="status-chip" data-status="pending">Pending</span>
        <div class="stage-time"></div>
      </li>`).join("");
  }

  function setStage(id, status, timeText) {
    const def = STAGES.find((s) => s.id === id);
    const el = $(`stage-${id}`);
    el.dataset.status = status;
    const chip = el.querySelector(".status-chip");
    chip.dataset.status = status === "skipped" ? "idle" : status;
    chip.textContent = STATUS_LABEL[status];
    const iconEl = el.querySelector(".stage-icon");
    iconEl.innerHTML = status === "success" ? ICONS.check : status === "failed" ? ICONS.cross : status === "running" ? ICONS.spinner : ICONS[def.icon];
    if (timeText !== undefined) el.querySelector(".stage-time").textContent = timeText;
  }

  function setProgress(done, status, label) {
    const pct = Math.round((done / STAGES.length) * 100);
    const fill = $("progressFill");
    fill.style.width = `${pct}%`;
    fill.className = `progress-fill ${status || ""}`;
    $("progressPct").textContent = `${pct}%`;
    $("progressBar").setAttribute("aria-valuenow", String(pct));
    if (label) $("progressLabel").textContent = label;
  }

  function showResult(success, buildNo, durationMs, simulated) {
    const banner = $("resultBanner");
    banner.className = `result-banner ${success ? "success" : "failed"}`;
    const prefix = simulated ? "Simulated build" : "Jenkins build";
    banner.innerHTML = `${success ? ICONS.successBig : ICONS.failBig}
      <div><strong>${prefix} #${buildNo} ${success ? "finished: SUCCESS" : "finished: FAILURE"}</strong>
      <span>${success ? "Hello.java compiled and ran successfully." : "The build failed. Check the console output for the error."} Duration ${formatDuration(durationMs)}.${simulated ? " No real GitHub or Jenkins connection was made." : ""}</span></div>`;
    toast(`${prefix} #${buildNo}: ${success ? "SUCCESS" : "FAILURE"}`, success ? "success" : "failed");
  }

  // ---------------------------------------------------------- console view
  const consoleView = () => $("consoleView");

  function clearConsole(title) {
    consoleView().innerHTML = "";
    $("consoleTitle").textContent = title;
  }

  function logLine(text, kind = "info") {
    const view = consoleView();
    const cursor = view.querySelector(".cursor");
    if (cursor) cursor.remove();
    const line = document.createElement("span");
    line.className = "log-line";
    line.innerHTML = `<span class="log-time">${clockTime()}</span><span class="log-${kind}">${escapeHtml(text)}</span>`;
    view.appendChild(line);
    view.insertAdjacentHTML("beforeend", '<span class="cursor"></span>');
    view.scrollTop = view.scrollHeight;
  }

  function endConsole() {
    const cursor = consoleView().querySelector(".cursor");
    if (cursor) cursor.remove();
  }

  // ---------------------------------------------------------- simulated build
  function buildScript(cfg, buildNo, fail) {
    const ws = `C:\\ProgramData\\Jenkins\\.jenkins\\workspace\\${cfg.jobName}`;
    const commit = randomHex(40);
    const javac = fail
      ? [
          [`${ws}\\sample-app>javac Hello.java`, "cmd"],
          ["Hello.java:3: error: ';' expected", "error"],
          ['        System.out.println("Hello, Jenkins!")', "error"],
          ["                                             ^", "error"],
          ["1 error", "error"],
          [`${ws}\\sample-app>exit /b 1`, "cmd"],
          ["Build step 'Execute Windows batch command' marked build as failure", "error"],
        ]
      : [
          [`${ws}\\sample-app>javac Hello.java`, "cmd"],
          ["Compilation finished: Hello.class created", "muted"],
        ];
    return [
      {
        stage: "repo", lines: [
          ["[SIMULATED DEMO] These logs are generated in the browser. GitHub and Jenkins are not contacted.", "banner"],
          ["Started by user student", "info"],
          ["Running as SYSTEM", "muted"],
          [`Building in workspace ${ws}`, "info"],
          [`Repository: ${cfg.repoUrl}`, "info"],
        ],
      },
      {
        stage: "checkout", lines: [
          ["The recommended git tool is: NONE", "muted"],
          ["Cloning the remote Git repository", "info"],
          [`Cloning repository ${cfg.repoUrl}`, "info"],
          [` > git.exe init ${ws} # timeout=10`, "cmd"],
          [`Fetching upstream changes from ${cfg.repoUrl}`, "info"],
          [` > git.exe fetch --tags --force --progress -- ${cfg.repoUrl} +refs/heads/*:refs/remotes/origin/*`, "cmd"],
          ["Checking out source code", "info"],
          [`Checking out Revision ${commit} (refs/remotes/origin/${cfg.branch})`, "info"],
          [` > git.exe checkout -f ${commit.slice(0, 10)}`, "cmd"],
          ['Commit message: "Add Hello.java"', "muted"],
        ],
      },
      {
        stage: "start", lines: [
          [`[${cfg.jobName}] $ cmd /c call C:\\Windows\\TEMP\\jenkins${randomHex(8)}.bat`, "cmd"],
          [`Build #${buildNo} started`, "info"],
        ],
      },
      { stage: "compile", fail, lines: [["Compiling Hello.java", "info"], ...javac] },
      {
        stage: "run", lines: [
          ["Running Hello.java", "info"],
          [`${ws}\\sample-app>java Hello`, "cmd"],
          ["Hello, Jenkins!", "out"],
        ],
      },
    ];
  }

  async function runDemoBuild() {
    if (state.running) return;
    resetPipeline(false); // invalidates any previous run, so take the token afterwards
    const token = ++state.runToken;
    const cancelled = () => token !== state.runToken;
    const fail = $("simulateFailure").checked;
    const cfg = state.config;
    const buildNo = nextBuildNumber();
    const startedAt = Date.now();

    setRunning(true);
    clearConsole(`Simulated build #${buildNo}`);
    updateStatusCard("running", buildNo);

    const script = buildScript(cfg, buildNo, fail);
    let done = 0;
    let failed = false;

    for (const step of script) {
      if (cancelled()) return;
      const stageStart = Date.now();
      setStage(step.stage, "running", "");
      setProgress(done, "running", `Running: ${STAGES.find((s) => s.id === step.stage).name}`);
      for (const [text, kind] of step.lines) {
        await sleep(180 + Math.random() * 260);
        if (cancelled()) return;
        logLine(text, kind);
      }
      await sleep(350);
      if (cancelled()) return;
      const t = formatDuration(Date.now() - stageStart);
      if (step.fail) {
        setStage(step.stage, "failed", t);
        failed = true;
        break;
      }
      setStage(step.stage, "success", t);
      done++;
    }

    if (failed) STAGES.forEach((s) => { if ($(`stage-${s.id}`).dataset.status === "pending" && s.id !== "result") setStage(s.id, "skipped", ""); });

    await sleep(300);
    if (cancelled()) return;
    const duration = Date.now() - startedAt;
    logLine(failed ? "Finished: FAILURE" : "Finished: SUCCESS", failed ? "error" : "success");
    endConsole();
    finishBuild({ buildNo, success: !failed, duration, startedAt, simulated: true });
  }

  function finishBuild({ buildNo, success, duration, startedAt, simulated }) {
    setStage("result", success ? "success" : "failed", success ? "SUCCESS" : "FAILURE");
    setProgress(STAGES.length, success ? "success" : "failed", success ? "Build finished: SUCCESS" : "Build finished: FAILURE");
    setRunning(false);
    addHistory({ number: buildNo, timestamp: startedAt, duration, result: success ? "SUCCESS" : "FAILURE", mode: simulated ? "Simulated" : "Jenkins" });
    showResult(success, buildNo, duration, simulated);
  }

  function setRunning(running) {
    state.running = running;
    $("runBtn").disabled = running;
    $("realBuildBtn").disabled = running || !(state.backend && state.backend.jenkins_reachable);
    $("simulateFailure").disabled = running;
    $("runBtn").innerHTML = running ? `${ICONS.spinner} Building…` : `${ICONS.start} Run Demo Build`;
  }

  function resetPipeline(clearLog = true) {
    state.runToken++;
    renderStages();
    setProgress(0, "", "Ready");
    $("resultBanner").className = "result-banner hidden";
    $("resultBanner").innerHTML = "";
    setRunning(false);
    if (clearLog) {
      consoleView().innerHTML = '<span class="log-muted">Click "Run Demo Build" to start the pipeline.</span>';
      $("consoleTitle").textContent = "Waiting for a build";
      renderDashboard();
    }
  }

  // ---------------------------------------------------------- real Jenkins build (via backend)
  async function api(path, options) {
    const res = await fetch(path, Object.assign({ headers: { Accept: "application/json" } }, options));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
    return data;
  }

  async function runRealBuild() {
    if (state.running || !state.backend || !state.backend.jenkins_reachable) return;
    resetPipeline(false);
    const token = ++state.runToken;
    const cancelled = () => token !== state.runToken;
    setRunning(true);
    clearConsole("Real Jenkins build (waiting in queue)");
    const startedAt = Date.now();
    updateStatusCard("running", "…");

    try {
      setStage("repo", "running");
      setProgress(0, "running", "Triggering Jenkins job…");
      const { queue_id } = await api("/api/jenkins/build", { method: "POST" });
      logLine(`Jenkins accepted the build request (queue item ${queue_id}). Waiting for an executor…`, "muted");

      let buildNo = null;
      while (!buildNo) {
        await sleep(1500);
        if (cancelled()) return;
        const q = await api(`/api/jenkins/queue/${queue_id}`);
        if (q.cancelled) throw new Error("The build was cancelled in the Jenkins queue.");
        buildNo = q.build_number;
      }
      $("consoleTitle").textContent = `Jenkins build #${buildNo} (live from ${state.backend.jenkins_url})`;
      updateStatusCard("running", buildNo);

      // Stream the real console log and map known lines to pipeline stages.
      const markers = [
        { re: /Cloning|Fetching upstream|git(\.exe)? (init|fetch)/i, stage: 1 },
        { re: /Checking out Revision/i, stage: 2 },
        { re: /javac/i, stage: 3 },
        { re: /java Hello|Running Hello/i, stage: 4 },
      ];
      let current = 0;
      const advanceTo = (idx) => {
        while (current < idx) {
          setStage(STAGES[current].id, "success");
          current++;
          setStage(STAGES[current].id, "running");
          setProgress(current, "running", `Running: ${STAGES[current].name}`);
        }
      };

      let offset = 0;
      let more = true;
      let lastStatus = null;
      while (more) {
        if (cancelled()) return;
        const log = await api(`/api/jenkins/builds/${buildNo}/log?start=${offset}`);
        offset = log.next;
        more = log.more;
        log.text.split(/\r?\n/).filter((l) => l.length).forEach((line) => {
          const marker = markers.find((m) => m.re.test(line));
          if (marker) advanceTo(marker.stage);
          const kind = /^Finished: SUCCESS/.test(line) ? "success" : /^Finished: (FAILURE|ABORTED|UNSTABLE)|error/i.test(line) ? "error" : /^Hello, Jenkins!$/.test(line) ? "out" : /^\s*>|^[A-Z]:\\.*>/.test(line) ? "cmd" : "info";
          logLine(line, kind);
        });
        if (more) await sleep(1200);
      }
      lastStatus = await api(`/api/jenkins/builds/${buildNo}`);
      while (lastStatus.building) {
        await sleep(1000);
        if (cancelled()) return;
        lastStatus = await api(`/api/jenkins/builds/${buildNo}`);
      }
      endConsole();
      const success = lastStatus.result === "SUCCESS";
      if (success) advanceTo(STAGES.length - 1);
      else setStage(STAGES[current].id, "failed");
      finishBuild({ buildNo, success, duration: lastStatus.duration || Date.now() - startedAt, startedAt: lastStatus.timestamp || startedAt, simulated: false });
    } catch (err) {
      if (cancelled()) return;
      logLine(`Error: ${err.message}`, "error");
      endConsole();
      setRunning(false);
      setProgress(0, "failed", "Could not complete the real Jenkins build");
      toast(err.message, "failed");
      renderDashboard();
    }
  }

  async function checkBackend() {
    if (location.protocol === "file:") {
      state.backend = null;
      applyMode("Opened as a local file. Run python app.py to enable the backend. Simulated demo is available.");
      return;
    }
    try {
      state.backend = await api("/api/status");
      applyMode(state.backend.message);
    } catch (e) {
      state.backend = null;
      applyMode("Backend not reachable. Simulated demo is available.");
    }
  }

  function applyMode(note) {
    const real = !!(state.backend && state.backend.jenkins_reachable);
    $("modeBadge").className = `badge ${real ? "badge-real" : "badge-sim"}`;
    $("modeBadgeText").textContent = real ? "Jenkins Connected" : "Simulated Demo";
    $("sidebarMode").classList.toggle("real", real);
    $("sidebarModeText").textContent = real ? "Jenkins connected" : "Simulated demo";
    $("realBuildBtn").classList.toggle("hidden", !(state.backend && state.backend.jenkins_configured));
    $("realBuildBtn").disabled = !real || state.running;
    $("jenkinsNote").textContent = note;
    const chip = $("jenkinsStatus");
    if (real) { chip.dataset.status = "success"; chip.textContent = "Connected"; }
    else if (state.backend && state.backend.jenkins_configured) { chip.dataset.status = "failed"; chip.textContent = "Unreachable"; }
    else { chip.dataset.status = "pending"; chip.textContent = "Simulated"; }
    $("pipelineSubtitle").textContent = real
      ? `"Run Real Jenkins Build" triggers job "${state.backend.job_name}" on ${state.backend.jenkins_url}. "Run Demo Build" stays a browser-only simulation.`
      : "Simulated demo. Stages run in your browser and no real GitHub or Jenkins connection is made.";
    if (real) {
      $("jenkinsUrl").textContent = state.backend.jenkins_url;
      $("jenkinsJob").textContent = state.backend.job_name;
      $("githubNote").textContent = "Jenkins clones this repository when a real build runs. The dashboard itself never contacts GitHub.";
    }
  }

  // ---------------------------------------------------------- history + dashboard
  function nextBuildNumber() {
    return state.history.reduce((max, b) => Math.max(max, b.mode === "Simulated" ? b.number : 0), 0) + 1;
  }

  function addHistory(entry) {
    state.history.unshift(entry);
    state.history = state.history.slice(0, 25);
    storage.set("buildlab.history", state.history);
    renderHistory();
    renderDashboard();
  }

  function renderHistory() {
    const body = $("historyBody");
    body.innerHTML = state.history.map((b) => `
      <tr>
        <td class="build-no">#${b.number}</td>
        <td>${escapeHtml(formatDate(b.timestamp))}</td>
        <td>${escapeHtml(formatDuration(b.duration))}</td>
        <td><span class="mode-tag">${escapeHtml(b.mode)}</span></td>
        <td><span class="status-chip" data-status="${b.result === "SUCCESS" ? "success" : "failed"}">${escapeHtml(b.result)}</span></td>
      </tr>`).join("");
    $("historyEmpty").classList.toggle("hidden", state.history.length > 0);
  }

  function updateStatusCard(status, buildNo) {
    const chip = $("statStatus");
    chip.dataset.status = status;
    chip.textContent = status === "running" ? "Building…" : status === "success" ? "SUCCESS" : status === "failed" ? "FAILURE" : "Not built yet";
    if (buildNo !== undefined) $("statBuildNo").textContent = `Build #${buildNo}`;
  }

  function renderDashboard() {
    const cfg = state.config;
    $("statProject").textContent = cfg.jobName;
    $("statRepo").textContent = cfg.repoUrl.replace(/^https?:\/\//, "");
    $("statRepo").title = cfg.repoUrl;
    $("statBranch").textContent = cfg.branch;
    $("githubUrl").textContent = cfg.repoUrl;
    $("githubBranch").textContent = cfg.branch;
    if (!(state.backend && state.backend.jenkins_reachable)) {
      $("jenkinsUrl").textContent = cfg.jenkinsUrl;
      $("jenkinsJob").textContent = cfg.jobName;
    }
    const last = state.history[0];
    if (last) {
      updateStatusCard(last.result === "SUCCESS" ? "success" : "failed", last.number);
      $("statBuildNo").textContent = `Build #${last.number} · ${last.mode}`;
      $("statLastTime").textContent = formatDate(last.timestamp);
      $("statLastDuration").textContent = `Duration: ${formatDuration(last.duration)}`;
    } else {
      updateStatusCard("idle");
      $("statBuildNo").textContent = "No builds yet";
      $("statLastTime").textContent = "—";
      $("statLastDuration").textContent = "Duration: —";
    }
  }

  // ---------------------------------------------------------- source viewer
  function highlightJava(src) {
    const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*")|\b(public|private|protected|class|static|void|final|new|return|import|package)\b|\b(String|System|Hello)\b|\b(println|main)\b/g;
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(src))) {
      out += escapeHtml(src.slice(last, m.index));
      const cls = m[1] ? "com" : m[2] ? "str" : m[3] ? "kw" : m[4] ? "type" : "fn";
      out += `<span class="tok-${cls}">${escapeHtml(m[0])}</span>`;
      last = re.lastIndex;
    }
    out += escapeHtml(src.slice(last));
    return out.split("\n").map((l) => `<span class="line">${l || " "}</span>`).join("");
  }

  let javaSource = HELLO_JAVA_FALLBACK;
  async function loadSource() {
    if (location.protocol !== "file:") {
      try {
        const res = await fetch("sample-app/Hello.java");
        if (res.ok) javaSource = (await res.text()).replace(/\r\n/g, "\n").replace(/\n$/, "");
      } catch (e) { /* keep embedded copy */ }
    }
    $("codeView").querySelector("code").innerHTML = highlightJava(javaSource);
  }

  // ---------------------------------------------------------- configuration form
  function fillConfigForm() {
    $("cfgRepo").value = state.config.repoUrl;
    $("cfgBranch").value = state.config.branch;
    $("cfgJenkins").value = state.config.jenkinsUrl;
    $("cfgJob").value = state.config.jobName;
  }

  function validateConfig() {
    const checks = [
      ["cfgRepo", (v) => /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?\/?$/.test(v), "Enter a GitHub URL like https://github.com/user/repo.git"],
      ["cfgBranch", (v) => /^[\w./-]+$/.test(v), "Enter a branch name such as main"],
      ["cfgJenkins", (v) => /^https?:\/\/[^\s/]+(:\d+)?(\/[^\s]*)?$/.test(v), "Enter a URL like http://localhost:8080"],
      ["cfgJob", (v) => /^[\w .-]+$/.test(v), "Use letters, numbers, spaces, dots, dashes or underscores"],
    ];
    let ok = true;
    checks.forEach(([id, test, msg]) => {
      const input = $(id);
      const valid = test(input.value.trim());
      input.classList.toggle("invalid", !valid);
      $(`${id}Err`).textContent = valid ? "" : msg;
      ok = ok && valid;
    });
    return ok;
  }

  function saveConfig(e) {
    e.preventDefault();
    if (!validateConfig()) {
      toast("Please fix the highlighted fields.", "failed");
      return;
    }
    state.config = {
      repoUrl: $("cfgRepo").value.trim(),
      branch: $("cfgBranch").value.trim(),
      jenkinsUrl: $("cfgJenkins").value.trim().replace(/\/$/, ""),
      jobName: $("cfgJob").value.trim(),
    };
    storage.set("buildlab.config", state.config);
    renderDashboard();
    toast("Configuration saved.", "success");
  }

  // ---------------------------------------------------------- navigation
  function setupNav() {
    const sidebar = $("sidebar");
    const backdrop = $("sidebarBackdrop");
    const menuBtn = $("menuBtn");
    const close = () => { sidebar.classList.remove("open"); backdrop.classList.remove("show"); menuBtn.setAttribute("aria-expanded", "false"); };
    menuBtn.addEventListener("click", () => {
      const open = !sidebar.classList.contains("open");
      sidebar.classList.toggle("open", open);
      backdrop.classList.toggle("show", open);
      menuBtn.setAttribute("aria-expanded", String(open));
    });
    backdrop.addEventListener("click", close);

    const links = Array.from(document.querySelectorAll(".nav-link"));
    links.forEach((a) => a.addEventListener("click", close));

    const setActive = (id) => links.forEach((a) => a.classList.toggle("active", a.dataset.section === id));
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => { if (entry.isIntersecting) setActive(entry.target.id); });
      }, { rootMargin: "-35% 0px -60% 0px" });
      links.forEach((a) => { const sec = $(a.dataset.section); if (sec) observer.observe(sec); });
    }
  }

  // ---------------------------------------------------------- init
  function init() {
    renderStages();
    renderHistory();
    renderDashboard();
    fillConfigForm();
    loadSource();
    setupNav();
    checkBackend();

    $("runBtn").addEventListener("click", runDemoBuild);
    $("realBuildBtn").addEventListener("click", runRealBuild);
    $("resetBtn").addEventListener("click", () => { resetPipeline(true); toast("Pipeline reset. Ready for another run.", "info"); });
    $("copyCodeBtn").addEventListener("click", async () => toast((await copyText(javaSource)) ? "Hello.java copied." : "Copy failed.", "info"));
    $("copyLogBtn").addEventListener("click", async () => {
      const text = Array.from(consoleView().querySelectorAll(".log-line")).map((l) => l.textContent).join("\n");
      if (!text) return toast("Console is empty.", "info");
      toast((await copyText(text)) ? "Console output copied." : "Copy failed.", "info");
    });
    $("clearHistoryBtn").addEventListener("click", () => {
      state.history = [];
      storage.set("buildlab.history", []);
      renderHistory();
      renderDashboard();
      toast("Build history cleared.", "info");
    });
    $("configForm").addEventListener("submit", saveConfig);
    $("cfgDefaultsBtn").addEventListener("click", () => {
      state.config = Object.assign({}, DEFAULT_CONFIG);
      storage.set("buildlab.config", state.config);
      fillConfigForm();
      validateConfig();
      renderDashboard();
      toast("Default configuration restored.", "info");
    });

    if (new URLSearchParams(location.search).get("autorun") === "1") runDemoBuild();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
