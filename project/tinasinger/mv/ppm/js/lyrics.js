(function () {
  "use strict";

  const STORAGE_KEY = "works/project/tinasinger/mv/ppm/lyrics-scene-memo/v3";

  /** Full lyrics + 전주/반주 — Right Here, Right Now */
  const SECTIONS = [
    {
      label: "전주",
      lines: ["(전주)", "(전주)"],
    },
    {
      label: "Verse 1",
      lines: [
        "Tv 앞에 춤을 추던",
        "아주 어린 날의 기억",
        "어른들에게 박수받으려 노래하던",
        "작은 시절",
      ],
    },
    {
      label: "Pre-Chorus 1",
      lines: ["이제 지나간 스토리", "모두 나의 멜로디"],
    },
    {
      label: "Chorus 1",
      lines: [
        "내 맘대로 노래할거야",
        "더 미루지 않을래",
        "Right here right now",
        "오래 그려왔던 그 날 위해",
        "내 목소리 들릴 수 있다면",
        "어디든 달려갈게",
      ],
    },
    {
      label: "Post-Chorus 1",
      lines: [
        "Right here right now",
        "내 이름 불러준다면",
        "Right here right now",
      ],
    },
    {
      label: "반주",
      lines: ["(반주)", "(반주)"],
    },
    {
      label: "Verse 2",
      lines: [
        "언젠가는 내 노래로",
        "주고 싶은 많은 단어",
        "거짓말처럼 여기 내 이야길 들어주는",
        "네가 있어",
      ],
    },
    {
      label: "Pre-Chorus 2",
      lines: ["이제 시작된 스토리", "모두 나의 멜로디"],
    },
    {
      label: "Chorus 2",
      lines: [
        "난 너에게 노래할거야",
        "내 맘을 다 전할래",
        "Right here right now",
        "나를 기다려준 너를 위해",
        "내 진심이 닿을 수 있다면",
        "어디든 달려갈게",
      ],
    },
    {
      label: "엔딩 반주",
      lines: ["(엔딩 반주)", "(엔딩 반주)"],
    },
  ];

  const listEl = document.getElementById("list");
  const btnClear = document.getElementById("btnClear");

  function loadMemos() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveMemos(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function memoKey(si, li) {
    return `${si}-${li}`;
  }

  function render() {
    const memos = loadMemos();
    listEl.innerHTML = SECTIONS.map((sec, si) => {
      const rows = sec.lines
        .map((line, li) => {
          const key = memoKey(si, li);
          const val = memos[key] || "";
          return `<div class="row">
            <div class="lyric${isInst ? " is-inst" : ""}">${escapeHtml(line)}</div>
            <textarea class="memo" data-key="${key}" rows="1" placeholder="장면 메모">${escapeHtml(val)}</textarea>
          </div>`;
        })
        .join("");
      return `<section class="section">
        <h2 class="section-label">${escapeHtml(sec.label)}</h2>
        ${rows}
      </section>`;
    }).join("");

    listEl.querySelectorAll(".memo").forEach((el) => {
      autoSize(el);
      el.addEventListener("input", () => {
        autoSize(el);
        const data = loadMemos();
        data[el.dataset.key] = el.value;
        saveMemos(data);
      });
    });
  }

  function autoSize(el) {
    el.style.height = "auto";
    el.style.height = `${Math.max(36, el.scrollHeight)}px`;
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  btnClear?.addEventListener("click", () => {
    if (!confirm("장면 메모만 지울까요? (가사는 유지)")) return;
    localStorage.removeItem(STORAGE_KEY);
    render();
  });

  render();
})();
