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
        "position:fixed;z-index:2147483647;top:20px;right:20px;max-width:460px;padding:14px 16px;border-radius:10px;font:14px/1.4 system-ui,sans-serif;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.35);white-space:pre-wrap";
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

  const parseWon = (text) => {
    if (text == null || text === "") return null;
    if (typeof text === "number" && Number.isFinite(text)) return Math.round(text);
    if (typeof text === "object") {
      if (text.units != null) {
        const u = Number(String(text.units).replace(/[^\d.-]/g, ""));
        return Number.isFinite(u) ? Math.round(u) : null;
      }
      const nested =
        text.simpleText || text.text || text.label || text.value || text.amount || text.count;
      if (nested != null) return parseWon(nested);
      return null;
    }
    let s = String(text).replace(/,/g, "").replace(/₩/g, "").replace(/원/g, "").trim();
    if (/^\d+(\.\d+)?만$/.test(s)) return Math.round(parseFloat(s) * 10000);
    const digits = s.replace(/[^\d.-]/g, "");
    if (!digits || digits === "." || digits === "-" || digits === "-.") return null;
    const n = Number(digits);
    return Number.isFinite(n) ? Math.round(n) : null;
  };

  const pick = (obj, names) => {
    if (!obj || typeof obj !== "object") return null;
    const map = {};
    for (const [k, v] of Object.entries(obj)) map[String(k).toLowerCase()] = v;
    for (const name of names) {
      if (map[name.toLowerCase()] != null) return map[name.toLowerCase()];
    }
    for (const [k, v] of Object.entries(obj)) {
      const nk = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (names.some((n) => nk.includes(n.toLowerCase().replace(/[^a-z0-9]/g, "")))) return v;
    }
    return null;
  };

  const normalizeClientPromo = (raw, idx) => {
    if (!raw || typeof raw !== "object") return null;
    const title =
      pick(raw, ["title", "name", "campaignName", "promotionName", "videoTitle", "displayName"]) ||
      "";
    const titleText =
      typeof title === "object"
        ? title.simpleText || title.text || (title.runs && title.runs[0] && title.runs[0].text) || ""
        : String(title || "").trim();
    const cost = parseWon(
      pick(raw, [
        "cost",
        "spend",
        "amountSpent",
        "budgetSpent",
        "totalCost",
        "spentAmount",
        "amountSpentMoney",
      ])
    );
    const impressions = parseWon(
      pick(raw, ["impressions", "impressionCount", "reach", "impression"])
    );
    const views = parseWon(
      pick(raw, ["views", "viewCount", "videoViews", "trueviewViews", "promotedViews"])
    );
    const subscribers = parseWon(
      pick(raw, ["subscribers", "subscribersGained", "subscriberCount", "followersGained", "subs"])
    );
    if (!(cost || impressions || views || subscribers)) return null;
    const idRaw = pick(raw, ["campaignId", "promotionId", "externalCampaignId", "entityId", "id"]);
    const id =
      (typeof idRaw === "object" ? idRaw.id || idRaw.campaignId : idRaw) ||
      "studio-dom-" + idx + "-" + String(titleText).slice(0, 24);
    return {
      id: String(id).startsWith("studio-") ? String(id) : "studio-" + String(id),
      title: String(titleText || "Studio 프로모션").slice(0, 80),
      cost: cost || 0,
      impressions: impressions || 0,
      views: views || 0,
      subscribers: subscribers || 0,
      status: String(pick(raw, ["status", "campaignStatus", "state"]) || ""),
      goal: String(pick(raw, ["goal", "objective", "campaignGoal"]) || ""),
      videoId: String(pick(raw, ["videoId", "encryptedVideoId"]) || ""),
      videoTitle: String(
        (pick(raw, ["videoTitle"]) && String(pick(raw, ["videoTitle"]))) || titleText || ""
      ),
      source: "youtube-studio",
    };
  };

  const looksPromoObj = (obj) => {
    if (!obj || typeof obj !== "object") return false;
    const keys = Object.keys(obj).join(" ").toLowerCase();
    return /promo|campaign|spend|cost|impression|subscriber|viewcount|budget/.test(keys);
  };

  const harvestFromObjects = (root) => {
    const bag = [];
    const walk = (node, depth) => {
      if (depth > 10 || node == null) return;
      if (Array.isArray(node)) {
        if (node.length && typeof node[0] === "object" && looksPromoObj(node[0])) {
          for (const item of node) if (item && typeof item === "object") bag.push(item);
        }
        for (const item of node.slice(0, 40)) walk(item, depth + 1);
        return;
      }
      if (typeof node !== "object") return;
      for (const [k, v] of Object.entries(node)) {
        if (/promo|campaign|metric|content|item|entr/i.test(k)) walk(v, depth + 1);
        else if (depth < 3) walk(v, depth + 1);
      }
    };
    walk(root, 0);
    return bag;
  };

  const harvestPolymerPromos = () => {
    const raw = [];
    const els = document.querySelectorAll("*");
    for (const el of els) {
      try {
        if (el.__data) raw.push(...harvestFromObjects(el.__data));
      } catch (_) {}
      try {
        if (el.promotions) raw.push(...harvestFromObjects({ promotions: el.promotions }));
      } catch (_) {}
      try {
        if (el.campaigns) raw.push(...harvestFromObjects({ campaigns: el.campaigns }));
      } catch (_) {}
    }
    const out = [];
    const seen = new Set();
    raw.forEach((item, i) => {
      const n = normalizeClientPromo(item, i);
      if (!n) return;
      const key = n.id + "|" + n.title + "|" + n.cost;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(n);
    });
    return out;
  };

  const scrapePromoTableDom = () => {
    const out = [];
    const rowSel = [
      "[role='row']",
      "ytcp-table-row",
      "ytcp-campaign-row",
      "ytgn-promotion-row",
      "tr",
    ].join(",");
    const rows = [...document.querySelectorAll(rowSel)];
    rows.forEach((row, idx) => {
      const text = (row.innerText || row.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length < 8) return;
      if (!/(활성|종료|일시중지|Active|Ended|Paused|완료)/i.test(text)) return;
      if (!/(₩|\d원|노출|조회|구독|impression|view|subscriber|\d{2,})/i.test(text)) return;

      const won = text.match(/₩\s*([\d,]+)/);
      const cost = won ? parseWon(won[1]) : null;
      // Prefer large integers near Korean metric words when present.
      const imprM = text.match(/노출[^\d]*([\d,]+)/i) || text.match(/([\d,]+)\s*노출/);
      const viewM = text.match(/조회[^\d]*([\d,]+)/i) || text.match(/([\d,]+)\s*조회/);
      const subM = text.match(/구독[^\d]*([\d,]+)/i) || text.match(/([\d,]+)\s*구독/);
      const impressions = imprM ? parseWon(imprM[1]) : null;
      const views = viewM ? parseWon(viewM[1]) : null;
      const subscribers = subM ? parseWon(subM[1]) : null;
      if (!(cost || impressions || views || subscribers)) return;

      let title = "";
      const titleEl =
        row.querySelector("#video-title, #title, a[href*='/video/'], .title, ytcp-video-title") ||
        null;
      if (titleEl) title = (titleEl.textContent || "").trim();
      if (!title) {
        title = text.split(/(활성|종료됨|종료|일시중지|Active|Ended)/i)[0].trim().slice(0, 80);
      }
      out.push({
        id: "studio-dom-" + idx,
        title: title || "Studio 프로모션 " + (idx + 1),
        cost: cost || 0,
        impressions: impressions || 0,
        views: views || 0,
        subscribers: subscribers || 0,
        status: /활성|Active/i.test(text) ? "진행중" : /일시중지|Paused/i.test(text) ? "일시중지" : "완료",
        source: "youtube-studio",
      });
    });
    return out;
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
    if (datasync) {
      hashes.push({
        label: "datasync+_u",
        sap: await sha1([datasync, ts, sap, ORIGIN].join(" ")),
        sap1: await sha1([datasync, ts, sap1, ORIGIN].join(" ")),
        sap3: await sha1([datasync, ts, sap3, ORIGIN].join(" ")),
        suffix: "_u",
      });
    }
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

  const importBody = async (body) => {
    if (body && body.payload) window.__ddditLastPayload = body.payload;
    if (body && body.promotions) window.__ddditLastPromotions = body.promotions;
    toast("보고 API로 전송 중…");
    const res = await fetch(API + "/api/dddit/youtube/report/studio-promotions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.ok === false) {
      const keys =
        (out.payloadKeys || []).slice(0, 10).join(",") ||
        Object.keys((body && body.payload) || {}).slice(0, 10).join(",");
      console.warn("[디디딧] parse fail", out);
      console.warn("[디디딧] payload @ window.__ddditLastPayload");
      console.warn("[디디딧] top keys", keys, "unitsPaths", out.unitsPaths, "interesting", out.interestingKeys);
      throw new Error(
        (out.message || out.detail || "import 실패") +
          " | keys=" +
          keys +
          " units=" +
          ((out.unitsPaths && out.unitsPaths.length) || 0)
      );
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
      }, 16000);

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

      try {
        const promoLink = [...document.querySelectorAll("a[href]")].find((a) =>
          /content\/promotions|\/promotions/i.test(a.getAttribute("href") || "")
        );
        if (promoLink) promoLink.click();
      } catch (_) {}
    });

  try {
    toast("동기화 시작…");
    const m = location.pathname.match(/\/channel\/(UC[\w-]+)/);
    const ch = m && m[1];
    if (!ch) throw new Error("Studio 채널(프로모션) URL에서 실행하세요");

    toast("Studio 자체 요청 가로채는 중…");
    let payload = null;
    try {
      payload = await captureFromPage();
    } catch (interceptErr) {
      console.warn(interceptErr);
    }

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

    window.__ddditLastPayload = payload;

    // Prefer sending payload; on parse failure fall back to in-page harvest.
    let done;
    try {
      done = await importBody({ payload });
    } catch (importErr) {
      console.warn("[디디딧] payload import failed, trying page harvest", importErr);
      toast("응답 파싱 실패 → 페이지 데이터로 재시도…");
      let promotions = harvestPolymerPromos();
      if (!promotions.length) promotions = scrapePromoTableDom();
      window.__ddditLastPromotions = promotions;
      console.warn("[디디딧] harvested promotions", promotions);
      if (!promotions.length) throw importErr;
      done = await importBody({ promotions });
    }

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
