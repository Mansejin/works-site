/* Paste into Studio Console (F12 → Console) while on the Promotions tab. */
(async () => {
  const API = "https://works-api.mansejin.com";
  const toast = (msg, ok) => {
    let el = document.getElementById("__dddit_sync_toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "__dddit_sync_toast";
      el.style.cssText =
        "position:fixed;z-index:2147483647;top:20px;right:20px;max-width:360px;padding:14px 16px;border-radius:10px;font:14px/1.4 system-ui,sans-serif;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.35)";
      document.documentElement.appendChild(el);
    }
    el.style.background = ok === false ? "#b91c1c" : ok ? "#166534" : "#1e293b";
    el.textContent = msg;
    console.log("[디디딧 Studio sync]", msg);
  };

  try {
    toast("동기화 시작…");
    const m = location.pathname.match(/\/channel\/(UC[\w-]+)/);
    const ch = m && m[1];
    if (!ch) throw new Error("Studio 채널 URL에서 실행하세요 (프로모션 탭)");

    const ck = (n) => {
      const x = document.cookie
        .split(";")
        .map((s) => s.trim())
        .find((t) => t.startsWith(n + "="));
      return x ? decodeURIComponent(x.slice(n.length + 1)) : "";
    };
    const sap = ck("SAPISID") || ck("__Secure-3PAPISID");
    const sap1 = ck("__Secure-1PAPISID") || sap;
    const sap3 = ck("__Secure-3PAPISID") || sap;
    if (!sap) throw new Error("SAPISID 없음 — Studio 로그인 상태를 확인하세요");

    const sha = async (s) => {
      const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
      return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
    };
    const mk = async (v) => {
      const t = Math.floor(Date.now() / 1000);
      return t + "_" + (await sha(t + " " + v + " https://studio.youtube.com")) + "_u";
    };
    const auth =
      "SAPISIDHASH " +
      (await mk(sap)) +
      " SAPISID1PHASH " +
      (await mk(sap1)) +
      " SAPISID3PHASH " +
      (await mk(sap3));

    const body = {
      channelId: ch,
      pageSize: 50,
      context: {
        client: {
          clientName: 62,
          clientVersion: "1.20260709.05.00",
          hl: "ko",
          gl: "KR",
        },
        user: {
          delegationContext: {
            externalChannelId: ch,
            roleType: { channelRoleType: "CREATOR_CHANNEL_ROLE_TYPE_OWNER" },
          },
        },
      },
    };

    let payload = null;
    let last = "";
    for (const au of ["1", "0"]) {
      toast("Studio 요청 중… (authuser=" + au + ")");
      const r = await fetch(
        "https://studio.youtube.com/youtubei/v1/promotions/list_promotions?alt=json&prettyPrint=false",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: auth,
            "X-Goog-AuthUser": au,
            "X-Youtube-Client-Name": "62",
            "X-Youtube-Client-Version": "1.20260709.05.00",
          },
          body: JSON.stringify(body),
        }
      );
      payload = await r.json().catch(() => ({}));
      if (r.ok) break;
      last = r.status + " " + ((payload && payload.error && payload.error.message) || "");
      payload = null;
    }
    if (!payload) throw new Error("Studio 요청 실패: " + last);

    toast("보고 API로 전송 중…");
    const res = await fetch(API + "/api/dddit/youtube/report/studio-promotions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.ok === false) {
      throw new Error(out.message || out.detail || "import HTTP " + res.status);
    }
    const done = out.message || "동기화 완료 " + (out.promotionCount || 0) + "개";
    toast(done, true);
    try {
      alert(done);
    } catch (_) {
      /* some browsers block alert from paste — toast remains */
    }
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    toast(msg, false);
    try {
      alert(msg);
    } catch (_) {}
  }
})();
