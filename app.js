(function () {
  const IMG_BASE = "images/";
  const NATIVE_W = 1105; // width all rendered images share

  const DOMAIN_ORDER = [
    "Algebra",
    "Advanced Math",
    "Geometry and Trigonometry",
    "Problem-Solving and Data Analysis",
  ];

  const state = {
    domainFilter: new Set(), // empty = all
    diffFilter: new Set(), // empty = all
    filtered: [],
    index: 0,
    answers: {}, // uid -> { picked, correct }
    questionOrder: [],
    sidebarCollapsed: false,
    desmosMinimized: false,
    desmosPosition: null,
  };

  const els = {
    domainFilters: document.getElementById("domainFilters"),
    diffFilters: document.getElementById("diffFilters"),
    bubbleMap: document.getElementById("bubbleMap"),
    questionCol: document.getElementById("questionCol"),
    crumb: document.getElementById("crumb"),
    qCounter: document.getElementById("qCounter"),
    diffTag: document.getElementById("diffTag"),
    scoreNum: document.getElementById("scoreNum"),
    totalCount: document.getElementById("totalCount"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtnTop: document.getElementById("nextBtnTop"),
    sidebar: document.getElementById("sidebar"),
    mobileToggle: document.getElementById("mobileToggle"),
    sidebarClose: document.getElementById("sidebarClose"),
    scrim: document.getElementById("scrim"),
    resetBtn: document.getElementById("resetBtn"),
    sidebarToggle: document.getElementById("sidebarToggle"),
    desmosFloat: document.getElementById("desmosFloat"),
    desmosHandle: document.getElementById("desmosHandle"),
    desmosBody: document.getElementById("desmosBody"),
    desmosToggle: document.getElementById("desmosToggle"),
    desmosReset: document.getElementById("desmosReset"),
    desmosOpenBtn: document.getElementById("desmosOpenBtn"),
  };

  function domainCounts() {
    const counts = {};
    QUESTIONS.forEach((q) => {
      counts[q.domain] = (counts[q.domain] || 0) + 1;
    });
    return counts;
  }

  function getQuestionOrder() {
    try {
      const savedOrder = localStorage.getItem("sat.questionOrder");
      if (savedOrder) {
        const parsed = JSON.parse(savedOrder);
        if (Array.isArray(parsed) && parsed.length === QUESTIONS.length) {
          const known = new Set(QUESTIONS.map((q) => q.uid));
          if (parsed.every((uid) => known.has(uid))) {
            return parsed;
          }
        }
      }
    } catch {
      // Ignore storage failures and regenerate below.
    }

    const shuffled = QUESTIONS.map((q) => q.uid);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    try {
      localStorage.setItem("sat.questionOrder", JSON.stringify(shuffled));
    } catch {
      // Ignore storage failures.
    }
    return shuffled;
  }

  function getOrderedQuestions(list) {
    const orderIndex = new Map(state.questionOrder.map((uid, index) => [uid, index]));
    const originalIndex = new Map(QUESTIONS.map((q, index) => [q.uid, index]));

    const answered = [];
    const unanswered = [];

    list.forEach((q) => {
      if (state.answers[q.uid]) answered.push(q);
      else unanswered.push(q);
    });

    answered.sort((a, b) => {
      const aTime = state.answers[a.uid]?.answeredAt || 0;
      const bTime = state.answers[b.uid]?.answeredAt || 0;
      if (aTime !== bTime) return aTime - bTime;
      return (originalIndex.get(a.uid) || 0) - (originalIndex.get(b.uid) || 0);
    });

    unanswered.sort((a, b) => {
      const aOrder = orderIndex.get(a.uid) ?? 0;
      const bOrder = orderIndex.get(b.uid) ?? 0;
      return aOrder - bOrder;
    });

    return [...answered, ...unanswered];
  }

  function buildFilters() {
    const counts = domainCounts();
    const domains = DOMAIN_ORDER.filter((d) => counts[d]);
    els.domainFilters.innerHTML = domains
      .map(
        (d) => `
      <label class="check-row">
        <input type="checkbox" data-domain="${d}">
        <span>${d}</span>
        <span class="count">${counts[d]}</span>
      </label>
    `,
      )
      .join("");

    els.domainFilters.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("change", () => {
        const d = inp.dataset.domain;
        if (inp.checked) state.domainFilter.add(d);
        else state.domainFilter.delete(d);
        applyFilters(true);
      });
    });

    els.diffFilters.querySelectorAll(".diff-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        const d = btn.dataset.diff;
        if (state.diffFilter.has(d)) {
          state.diffFilter.delete(d);
          btn.classList.remove("active");
        } else {
          state.diffFilter.add(d);
          btn.classList.add("active");
        }
        applyFilters(true);
      });
    });

    els.totalCount.textContent = `${QUESTIONS.length} official questions`;
  }

  function applyFilters(resetIndex, preserveUid = null) {
    const currentUid = preserveUid || (!resetIndex ? state.filtered[state.index]?.uid || null : null);
    const filtered = QUESTIONS.filter((q) => {
      if (state.domainFilter.size && !state.domainFilter.has(q.domain))
        return false;
      if (state.diffFilter.size && !state.diffFilter.has(q.difficulty))
        return false;
      return true;
    });
    state.filtered = getOrderedQuestions(filtered);
    if (resetIndex) state.index = 0;
    if (currentUid) {
      const nextIndex = state.filtered.findIndex((q) => q.uid === currentUid);
      if (nextIndex >= 0) state.index = nextIndex;
    }
    if (state.index >= state.filtered.length) state.index = Math.max(0, state.filtered.length - 1);
    renderBubbleMap();
    renderQuestion();
    updateScore();
  }

  function renderBubbleMap() {
    const filteredSet = new Set(state.filtered.map((q) => q.uid));
    const orderedQuestions = getOrderedQuestions(QUESTIONS);
    els.bubbleMap.innerHTML = orderedQuestions.map((q, i) => {
      const ans = state.answers[q.uid];
      let cls = "bubble";
      if (ans) cls += ans.correct ? " correct" : " incorrect";
      if (!filteredSet.has(q.uid)) cls += " hidden-filter";
      const globalIdx = i + 1;
      return `<button class="${cls}" data-uid="${q.uid}" title="Q${globalIdx}: ${q.domain}">${globalIdx}</button>`;
    }).join("");

    els.bubbleMap.querySelectorAll(".bubble").forEach((b) => {
      b.addEventListener("click", () => {
        const uid = b.dataset.uid;
        const idx = state.filtered.findIndex((q) => q.uid === uid);
        if (idx >= 0) {
          state.index = idx;
          renderQuestion();
          closeMobileSidebar();
        }
      });
    });
    markCurrentBubble();
  }

  function markCurrentBubble() {
    els.bubbleMap
      .querySelectorAll(".bubble")
      .forEach((b) => b.classList.remove("current"));
    const q = state.filtered[state.index];
    if (!q) return;
    const el = els.bubbleMap.querySelector(`.bubble[data-uid="${q.uid}"]`);
    if (el) el.classList.add("current");
  }

  function updateScore() {
    const attempted = Object.keys(state.answers).length;
    const correct = Object.values(state.answers).filter(
      (a) => a.correct,
    ).length;
    els.scoreNum.innerHTML = `${correct}<span> / ${attempted}</span>`;
  }

  function loadUiState() {
    try {
      const savedSidebar = localStorage.getItem("sat.sidebarCollapsed");
      const savedDesmosMinimized = localStorage.getItem("sat.desmosMinimized");
      const savedDesmosPosition = localStorage.getItem("sat.desmosPosition");
      state.sidebarCollapsed = savedSidebar === "true";
      state.desmosMinimized = savedDesmosMinimized === "true";
      state.desmosPosition = savedDesmosPosition
        ? JSON.parse(savedDesmosPosition)
        : null;
    } catch {
      state.sidebarCollapsed = false;
      state.desmosMinimized = false;
      state.desmosPosition = null;
    }
  }

  function loadAnswersState() {
    try {
      const savedAnswers = localStorage.getItem("sat.answers");
      if (!savedAnswers) return;
      const parsed = JSON.parse(savedAnswers);
      state.answers = {};
      Object.entries(parsed).forEach(([uid, answer]) => {
        const q = QUESTIONS.find((item) => item.uid === uid);
        if (!q || !answer || typeof answer.picked !== "string") return;
        const correct = q.has_choices
          ? answer.picked === q.correct
          : checkFreeResponse(answer.picked, q.correct || "");
        state.answers[uid] = {
          picked: answer.picked,
          correct,
          answeredAt: typeof answer.answeredAt === "number" ? answer.answeredAt : 0,
        };
      });
    } catch {
      state.answers = {};
    }
  }

  function saveUiState() {
    try {
      localStorage.setItem(
        "sat.sidebarCollapsed",
        String(state.sidebarCollapsed),
      );
      localStorage.setItem(
        "sat.desmosMinimized",
        String(state.desmosMinimized),
      );
      if (state.desmosPosition) {
        localStorage.setItem(
          "sat.desmosPosition",
          JSON.stringify(state.desmosPosition),
        );
      } else {
        localStorage.removeItem("sat.desmosPosition");
      }
    } catch {
      // Ignore storage failures.
    }
  }

  function saveAnswersState() {
    try {
      localStorage.setItem("sat.answers", JSON.stringify(state.answers));
    } catch {
      // Ignore storage failures.
    }
  }

  function syncSidebarState() {
    els.app.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    els.sidebarToggle.textContent = state.sidebarCollapsed
      ? "Expand"
      : "Collapse";
    els.sidebarToggle.setAttribute(
      "aria-label",
      state.sidebarCollapsed
        ? "Expand left navigation"
        : "Collapse left navigation",
    );
    saveUiState();
  }

  function syncDesmosState() {
    els.desmosFloat.classList.toggle("minimized", state.desmosMinimized);
    els.desmosOpenBtn.classList.toggle("show", state.desmosMinimized);
    els.desmosToggle.textContent = state.desmosMinimized ? "Close" : "Close";
    els.desmosToggle.setAttribute(
      "aria-label",
      state.desmosMinimized
        ? "Close graphing calculator"
        : "Close graphing calculator",
    );
    if (!state.desmosMinimized) {
      if (state.desmosPosition) {
        els.desmosFloat.style.left = state.desmosPosition.left;
        els.desmosFloat.style.top = state.desmosPosition.top;
        els.desmosFloat.style.right = "auto";
        els.desmosFloat.style.bottom = "auto";
      } else {
        els.desmosFloat.style.left = "";
        els.desmosFloat.style.top = "";
        els.desmosFloat.style.right = "18px";
        els.desmosFloat.style.bottom = "18px";
      }
    }
    saveUiState();
  }

  function clampDesmosPosition(left, top) {
    const rect = els.desmosFloat.getBoundingClientRect();
    const width = rect.width || 360;
    const height = rect.height || 320;
    const maxLeft = Math.max(12, window.innerWidth - width - 12);
    const maxTop = Math.max(12, window.innerHeight - height - 12);
    return {
      left: `${Math.min(Math.max(12, left), maxLeft)}px`,
      top: `${Math.min(Math.max(12, top), maxTop)}px`,
    };
  }

  function resetDesmosPosition() {
    state.desmosPosition = null;
    syncDesmosState();
  }

  function closeDesmos() {
    state.desmosMinimized = true;
    syncDesmosState();
  }

  function openDesmos() {
    state.desmosMinimized = false;
    syncDesmosState();
  }

  function normalizeAnswer(s) {
    return s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/^\$/, "")
      .replace(/%$/, "");
  }

  function checkFreeResponse(userVal, correctRaw) {
    const accepted = correctRaw.split(",").map((s) => normalizeAnswer(s));
    return accepted.includes(normalizeAnswer(userVal));
  }

  function renderQuestion() {
    const q = state.filtered[state.index];
    if (!q) {
      els.questionCol.innerHTML = `<div class="empty-state">No questions match the current filters.</div>`;
      els.crumb.textContent = "—";
      els.qCounter.textContent = "0 / 0";
      els.diffTag.textContent = "—";
      els.diffTag.className = "diff-tag";
      els.prevBtn.disabled = true;
      els.nextBtnTop.disabled = true;
      return;
    }

    els.crumb.innerHTML = `${q.domain}<span class="sep">/</span>${q.skill}`;
    els.qCounter.textContent = `Question Id ${q.uid.split("_").pop()}`;
    els.diffTag.textContent = q.difficulty || "—";
    els.diffTag.className = "diff-tag " + (q.difficulty || "");

    els.prevBtn.disabled = state.index === 0;
    els.nextBtnTop.disabled = state.index === state.filtered.length - 1;

    const existingAnswer = state.answers[q.uid];

    const overlayLetters = new Set(q.choice_overlay.map((o) => o.letter));
    const overlayComplete =
      q.has_choices && ["A", "B", "C", "D"].every((l) => overlayLetters.has(l));

    const frontHtml = q.front_images
      .map((fname, pageIdx) => {
        const overlays = overlayComplete
          ? q.choice_overlay.filter((o) => o.page_idx === pageIdx)
          : [];
        const hitsHtml = overlays
          .map(
            (o) => `
        <button class="choice-hit" data-letter="${o.letter}"
          style="top:${o.top}px; ${o.bottom !== null ? `height:${o.bottom - o.top}px;` : `bottom:0;`}"
          data-page="${pageIdx}"></button>
      `,
          )
          .join("");
        return `<div class="choice-overlay-wrap" data-page="${pageIdx}">
        <img src="${IMG_BASE}${fname}" data-native-w="${q.img_w}" draggable="false">
        ${hitsHtml}
      </div>`;
      })
      .join("");

    const answerZoneHtml = q.has_choices
      ? overlayComplete
        ? ""
        : `<div class="fallback-choices">
          ${["A", "B", "C", "D"].map((l) => `<button class="fallback-btn" data-letter="${l}" ${existingAnswer ? "disabled" : ""}>${l}</button>`).join("")}
        </div>`
      : `<div class="free-response">
          <label for="freInput">Your answer</label>
          <input type="text" id="freInput" placeholder="e.g. 3/4 or 0.75" ${existingAnswer ? "disabled" : ""} value="${existingAnswer ? existingAnswer.picked : ""}">
          <button class="check-btn" id="freCheckBtn" ${existingAnswer ? "disabled" : ""}>Check</button>
        </div>`;

    let feedbackHtml = "";
    let rationaleHtml = "";
    if (existingAnswer) {
      feedbackHtml = `<div class="feedback-banner ${existingAnswer.correct ? "correct" : "incorrect"}">
        <span class="mark">${existingAnswer.correct ? "✓" : "✗"}</span>
        <span>${existingAnswer.correct ? "Correct." : `Not quite — correct answer: ${q.correct}`}</span>
      </div>`;
      rationaleHtml = `<div class="rationale-wrap">
        <div class="rationale-label">Explanation</div>
        <div class="img-stack">
          ${q.back_images.map((f) => `<img src="${IMG_BASE}${f}" draggable="false">`).join("")}
        </div>
      </div>`;
    }

    els.questionCol.innerHTML = `
      <div class="card">
        <div class="img-stack">${frontHtml}</div>
        ${answerZoneHtml}
        ${feedbackHtml}
        ${rationaleHtml}
      </div>
      <div class="bottom-row">
        <span class="hint-text">${q.has_choices ? "Click an answer choice above" : existingAnswer ? "" : "Type your answer and check"}</span>
        <button class="next-btn" id="nextBtn" ${state.index === state.filtered.length - 1 ? "disabled" : ""}>
          Next question →
        </button>
      </div>
    `;

    // position overlays once images load
    els.questionCol
      .querySelectorAll(".choice-overlay-wrap img")
      .forEach((img) => {
        const draw = () => positionOverlaysFor(img);
        if (img.complete) draw();
        else img.addEventListener("load", draw);
      });

    if (existingAnswer && q.has_choices) {
      lockChoiceHits(q, existingAnswer);
    } else if (q.has_choices && overlayComplete) {
      els.questionCol.querySelectorAll(".choice-hit").forEach((hit) => {
        hit.addEventListener("click", () =>
          answerChoice(q, hit.dataset.letter),
        );
      });
    } else if (q.has_choices && !overlayComplete) {
      els.questionCol.querySelectorAll(".fallback-btn").forEach((btn) => {
        btn.addEventListener("click", () =>
          answerChoice(q, btn.dataset.letter),
        );
      });
    }

    if (!q.has_choices && !existingAnswer) {
      const btn = document.getElementById("freCheckBtn");
      const input = document.getElementById("freInput");
      const submit = () => {
        if (!input.value.trim()) return;
        answerFree(q, input.value.trim());
      };
      btn.addEventListener("click", submit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
    }

    const nextBtn = document.getElementById("nextBtn");
    if (nextBtn) nextBtn.addEventListener("click", goNext);

    markCurrentBubble();
  }

  function positionOverlaysFor(img) {
    const wrap = img.closest(".choice-overlay-wrap");
    const scale = img.clientWidth / NATIVE_W;
    wrap.querySelectorAll(".choice-hit").forEach((hit) => {
      const topPx = parseFloat(hit.style.top);
      hit.style.top = topPx * scale + "px";
      if (hit.style.height) {
        const h = parseFloat(hit.style.height);
        hit.style.height = h * scale + "px";
      }
    });
    // store scale reference so we don't double-scale on resize re-trigger
  }

  function answerChoice(q, letter) {
    if (state.answers[q.uid]) return;
    const correct = letter === q.correct;
    state.answers[q.uid] = { picked: letter, correct, answeredAt: Date.now() };
    saveAnswersState();
    applyFilters(false, q.uid);
  }

  function answerFree(q, value) {
    if (state.answers[q.uid]) return;
    const correct = checkFreeResponse(value, q.correct || "");
    state.answers[q.uid] = { picked: value, correct, answeredAt: Date.now() };
    saveAnswersState();
    applyFilters(false, q.uid);
  }

  function lockChoiceHits(q, answer) {
    els.questionCol.querySelectorAll(".choice-hit").forEach((hit) => {
      hit.classList.add("locked");
      const letter = hit.dataset.letter;
      if (letter === q.correct) hit.classList.add("reveal-correct");
      else if (letter === answer.picked) hit.classList.add("reveal-incorrect");
    });
    els.questionCol.querySelectorAll(".fallback-btn").forEach((btn) => {
      btn.disabled = true;
      const letter = btn.dataset.letter;
      if (letter === q.correct) btn.classList.add("reveal-correct");
      else if (letter === answer.picked) btn.classList.add("reveal-incorrect");
    });
  }

  function goNext() {
    if (state.index < state.filtered.length - 1) {
      state.index++;
      renderQuestion();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  function goPrev() {
    if (state.index > 0) {
      state.index--;
      renderQuestion();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function openSidebar() {
    if (window.innerWidth <= 900) {
      openMobileSidebar();
      return;
    }
    state.sidebarCollapsed = false;
    syncSidebarState();
  }

  function toggleSidebar() {
    if (window.innerWidth <= 900) {
      if (els.sidebar.classList.contains("open")) closeMobileSidebar();
      else openMobileSidebar();
      return;
    }
    state.sidebarCollapsed = !state.sidebarCollapsed;
    syncSidebarState();
  }

  function toggleDesmosMinimized() {
    state.desmosMinimized = !state.desmosMinimized;
    syncDesmosState();
  }

  function setupDesmosDrag() {
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let dragging = false;

    const onPointerMove = (event) => {
      if (!dragging) return;
      const next = clampDesmosPosition(
        startLeft + (event.clientX - startX),
        startTop + (event.clientY - startY),
      );
      state.desmosPosition = next;
      els.desmosFloat.style.left = next.left;
      els.desmosFloat.style.top = next.top;
      els.desmosFloat.style.right = "auto";
      els.desmosFloat.style.bottom = "auto";
    };

    const stopDragging = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stopDragging);
      document.removeEventListener("pointercancel", stopDragging);
      saveUiState();
    };

    els.desmosHandle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      dragging = true;
      const rect = els.desmosFloat.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      els.desmosHandle.setPointerCapture(event.pointerId);
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", stopDragging);
      document.addEventListener("pointercancel", stopDragging);
      event.preventDefault();
    });
  }

  els.prevBtn.addEventListener("click", goPrev);
  els.nextBtnTop.addEventListener("click", goNext);
  els.sidebarToggle.addEventListener("click", toggleSidebar);
  els.desmosToggle.addEventListener("click", closeDesmos);
  els.desmosOpenBtn.addEventListener("click", openDesmos);
  els.desmosReset.addEventListener("click", resetDesmosPosition);

  function openMobileSidebar() {
    els.sidebar.classList.add("open");
    els.scrim.classList.add("show");
  }
  function closeMobileSidebar() {
    els.sidebar.classList.remove("open");
    els.scrim.classList.remove("show");
  }
  els.mobileToggle.addEventListener("click", openMobileSidebar);
  els.sidebarClose.addEventListener("click", closeMobileSidebar);
  els.scrim.addEventListener("click", closeMobileSidebar);

  els.resetBtn.addEventListener("click", () => {
    if (!confirm("Reset all filters and answered progress?")) return;
    state.domainFilter.clear();
    state.diffFilter.clear();
    state.answers = {};
    saveAnswersState();
    els.domainFilters
      .querySelectorAll("input")
      .forEach((i) => (i.checked = false));
    els.diffFilters
      .querySelectorAll(".diff-pill")
      .forEach((b) => b.classList.remove("active"));
    applyFilters(true);
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderQuestion();
      if (state.desmosPosition) {
        state.desmosPosition = clampDesmosPosition(
          parseFloat(state.desmosPosition.left),
          parseFloat(state.desmosPosition.top),
        );
        syncDesmosState();
      }
    }, 200);
  });

  // init
  els.app = document.querySelector(".app");
  state.questionOrder = getQuestionOrder();
  loadUiState();
  loadAnswersState();
  syncSidebarState();
  syncDesmosState();
  setupDesmosDrag();
  buildFilters();
  applyFilters(true);
})();
