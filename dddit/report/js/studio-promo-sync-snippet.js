/* Paste into Studio Console (F12 → Console) on the Promotions tab. */
(async () => {
  const API = "https://works-api.mansejin.com";
  const ORIGIN = "https://studio.youtube.com";

  const toast = (msg, ok) => {
    let el = document.getElementById("__dddit_sync_toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "__dddit_sync_toast";
      el.style.cssText =
        "position:fixed;z-index:2147483647;top:20px;right:20px;max-width:420px;padding:14px 16px;border-radius:10px;font:14px/1.4 system-ui,sans-serif;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.35)";
      document.documentElement.appendChild(el);
    }
    el.style.background = ok === false ? "#b91c1c" : ok ? "#166534" : "#1e293b";
    el.textContent = msg;
    console.log("[디디딧 Studio sync]", msg);
  };

  const ck = (n) => {
    const x = document.cookie
      .split(";")
      .map((s) => s.trim())
      .find((t) => t.startsWith(n + "="));
    return x ? decodeURIComponent(x.slice(n.length + 1)) : "";
  };

  const ytget = (key) => {
    try {
      if (window.ytcfg && typeof window.ytcfg.get === "function") return window.ytcfg.get(key);
    } catch (_) {}
    try {
      return window.ytcfg && window.ytcfg.data_ ? window.ytcfg.data_[key] : null;
    } catch (_) {
      return null;
    }
  };

  const sha1 = async (s) => {
    const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  };

  const buildAuthVariants = async () => {
    const sap = ck("SAPISID") || ck("__Secure-3PAPISID");
    const sap1 = ck("__Secure-1PAPISID") || sap;
    const sap3 = ck("__Secure-3PAPISID") || sap;
    if (!sap) throw new Error("SAPISID 없음 — Studio에 로그인되어 있는지 확인하세요");

    const ts = Math.floor(Date.now() / 1000);
    const datasyncRaw = ytget("DATASYNC_ID") || "";
    const datasync = String(datasyncRaw).split("||")[0] || "";

    const hashes = [];
    // Modern Studio/YouTube (_u + DATASYNC_ID)
    if (datasync) {
      hashes.push({
        label: "datasync+_u",
        sap: await sha1([datasync, ts, sap, ORIGIN].join(" ")),
        sap1: await sha1([datasync, ts, sap1, ORIGIN].join(" ")),
        sap3: await sha1([datasync, ts, sap3, ORIGIN].join(" ")),
        suffix: "_u",
      });
    }
    // Classic
    hashes.push({
      label: "classic+_u",
      sap: await sha1([ts, sap, ORIGIN].join(" ")),
      sap1: await sha1([ts, sap1, ORIGIN].join(" ")),
      sap3: await sha1([ts, sap3, ORIGIN].join(" ")),
      suffix: "_u",
    });
    hashes.push({
      label: "classic",
      sap: await sha1([ts, sap, ORIGIN].join(" ")),
      sap1: await sha1([ts, sap1, ORIGIN].join(" ")),
      sap3: await sha1([ts, sap3, ORIGIN].join(" ")),
      suffix: "",
    });

    return hashes.map((h) => ({
      label: h.label,
      value:
        "SAPISIDHASH " +
        ts +
        "_" +
        h.sap +
        h.suffix +
        " SAPISID1PHASH " +
        ts +
        "_" +
        h.sap1 +
        h.suffix +
        " SAPISID3PHASH " +
        ts +
        "_" +
        h.sap3 +
        h.suffix,
    }));
  };

  const importPayload = async (payload) => {
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
    return out.message || "동기화 완료 " + (out.promotionCount || 0) + "개";
  };

  const captureFromPage = () =>
    new Promise((resolve, reject) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          reject(new Error("페이지 요청 가로채기 타임아웃"));
        }
      }, 12000);

      const maybe = async (url, text) => {
        if (!/list_promotions/i.test(String(url || ""))) return;
        try {
          const j = JSON.parse(text);
          if (j && !j.error) finish(j);
        } catch (_) {}
      };

      const ofetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const res = await ofetch(...args);
        try {
          const url = typeof args[0] === "string" ? args[0] : args[0] && args[0].url;
          if (/list_promotions/i.test(String(url || ""))) {
            res.clone().text().then((t) => maybe(url, t));
          }
        } catch (_) {}
        return res;
      };

      const open = XMLHttpRequest.prototype.open;
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        this.__dddit_url = url;
        return open.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        this.addEventListener("load", function () {
          maybe(this.__dddit_url, this.responseText);
        });
        return send.apply(this, arguments);
      };

      // Soft-trigger Studio to refetch promotions list
      try {
        const promoLink = [...document.querySelectorAll("a[href]")].find((a) =>
          /content\/promotions/i.test(a.getAttribute("href") || "")
        );
        if (promoLink) promoLink.click();
      } catch (_) {}
    });

  try {
    toast("동기화 시작…");
    const m = location.pathname.match(/\/channel\/(UC[\w-]+)/);
    const ch = m && m[1];
    if (!ch) throw new Error("Studio 채널(프로모션) URL에서 실행하세요");

    // 1) Prefer intercepting Studio's own authenticated request
    toast("Studio 자체 요청 가로채는 중… (잠시만요)");
    let payload = null;
    try {
      payload = await captureFromPage();
    } catch (interceptErr) {
      console.warn(interceptErr);
    }

    // 2) Fallback: craft auth with DATASYNC_ID variants
    if (!payload) {
      toast("직접 요청으로 재시도…");
      const innertubeCtx = ytget("INNERTUBE_CONTEXT") || {};
      const clientVersion =
        (innertubeCtx.client && innertubeCtx.client.clientVersion) ||
        ytget("INNERTUBE_CLIENT_VERSION") ||
        "1.20260709.05.00";
      const visitor = ytget("VISITOR_DATA") || (innertubeCtx.client && innertubeCtx.client.visitorData) || "";
      const delegated = ytget("DELEGATED_SESSION_ID") || "";
      const authVariants = await buildAuthVariants();
      const authUsers = ["1", "0"];
      let last = "";

      const body = {
        channelId: ch,
        pageSize: 50,
        context: {
          client: Object.assign(
            {
              clientName: 62,
              clientVersion: String(clientVersion),
              hl: "ko",
              gl: "KR",
            },
            visitor ? { visitorData: visitor } : {}
          ),
          user: {
            delegationContext: {
              externalChannelId: ch,
              roleType: { channelRoleType: "CREATOR_CHANNEL_ROLE_TYPE_OWNER" },
            },
          },
        },
      };
      if (delegated) body.context.user.onBehalfOfUser = String(delegated).split("||")[0];

      outer: for (const auth of authVariants) {
        for (const au of authUsers) {
          toast("요청 중… " + auth.label + " / authuser=" + au);
          const headers = {
            "Content-Type": "application/json",
            Authorization: auth.value,
            "X-Goog-AuthUser": au,
            "X-Origin": ORIGIN,
            "X-Youtube-Client-Name": "62",
            "X-Youtube-Client-Version": String(clientVersion),
          };
          if (visitor) headers["X-Goog-Visitor-Id"] = visitor;

          const r = await fetch(
            "https://studio.youtube.com/youtubei/v1/promotions/list_promotions?alt=json&prettyPrint=false",
            {
              method: "POST",
              credentials: "include",
              headers,
              body: JSON.stringify(body),
            }
          );
          const json = await r.json().catch(() => ({}));
          if (r.ok && json && !json.error) {
            payload = json;
            break outer;
          }
          last = r.status + " " + ((json.error && json.error.message) || auth.label);
        }
      }
      if (!payload) throw new Error("Studio 요청 실패: " + last);
    }

    const done = await importPayload(payload);
    toast(done, true);
    try {
      alert(done);
    } catch (_) {}
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    toast(msg, false);
    try {
      alert(msg);
    } catch (_) {}
  }
})();
