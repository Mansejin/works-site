# One-off script to generate Google Ads API design PDF
from pathlib import Path

from fpdf import FPDF

OUT = Path(__file__).resolve().parent / "google-ads-api-design-sample.pdf"


class PDF(FPDF):
    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(100, 116, 139)
        self.cell(0, 8, "DD-DIT internal tool - Google Ads API Basic Access", align="C")


pdf = PDF()
pdf.set_auto_page_break(auto=True, margin=15)
pdf.add_page()
pdf.set_margins(18, 18, 18)
w = pdf.w - pdf.l_margin - pdf.r_margin

pdf.set_font("Helvetica", "B", 16)
pdf.set_text_color(15, 23, 42)
pdf.cell(w, 10, "DD-DIT Channel Report", new_x="LMARGIN", new_y="NEXT")
pdf.set_font("Helvetica", "", 9)
pdf.set_text_color(100, 116, 139)
pdf.multi_cell(
    w,
    5,
    "Google Ads API Integration - Design Document (Internal Tool)\n"
    "Project: works-site / dddit | Date: July 2026 | Contact: ddditchannel@gmail.com",
)
pdf.ln(4)


def heading(text: str):
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(30, 64, 175)
    pdf.cell(w, 8, text, new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(37, 99, 235)
    y = pdf.get_y()
    pdf.line(18, y, 192, y)
    pdf.ln(4)


def body(text: str):
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(30, 41, 59)
    pdf.multi_cell(w, 5.5, text)
    pdf.ln(2)


def bullet(items: list[str]):
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(30, 41, 59)
    for item in items:
        pdf.multi_cell(w, 5.5, "- " + item)
    pdf.ln(2)


heading("1. Purpose")
body(
    "Private internal workspace for the DD-DIT YouTube channel team. "
    "Google Ads API reads campaign cost, impressions, views, and clicks from our own "
    "Google Ads account only. Data is shown on the channel report dashboard for CPV/CPM "
    "analysis together with YouTube Analytics."
)
bullet(
    [
        "Report URL: works.mansejin.com/dddit/report/ (noindex, team-only)",
        "API access: read-only (no campaign create, edit, or delete)",
        "Audience: internal team members only",
    ]
)

heading("2. Architecture")
body(
    "Google Ads Account (144-794-4603)\n"
    "  -> Google Ads API (metrics read)\n"
    "  -> NAS Docker works-api (OAuth + developer token in server .env)\n"
    "  -> HTTPS REST\n"
    "  -> works.mansejin.com/dddit/report/ (team browser, no secrets in frontend)"
)

heading("3. Data Flow")
bullet(
    [
        "Team opens report page or clicks Refresh.",
        "Backend endpoint: POST /api/dddit/youtube/report/ads/sync",
        "works-api queries Google Ads API for campaign metrics (last 30 days).",
        "Results cached in NAS data/youtube/ads-sync.json; merged with manual notes.",
        "UI shows promotion table: cost, impressions, views, CPV, efficiency.",
    ]
)

heading("4. UI - Promotion Efficiency Table")
body(
    "Campaign: Shokz OpenFit promo | Cost: KRW 84,266 | Impressions: 29,672 | CPV: KRW 25\n"
    "Campaign: Ikko MindOne pro | Cost: KRW 156,800 | Impressions: 56,295 | CPV: KRW 134"
)

heading("5. API Usage Scope")
bullet(
    [
        "Operations: campaign search; metrics cost_micros, impressions, video_views, clicks",
        "Accounts: own account only (customer ID 1447944603)",
        "Write operations: none",
        "Third-party accounts: none",
        "Refresh: on page load or manual refresh (about 1 hour cache)",
    ]
)

heading("6. Security")
bullet(
    [
        "Tokens stored only in NAS server .env (not in Git or browser).",
        "Frontend static site has no Google credentials.",
        "Report page uses noindex; CORS restricted to works.mansejin.com.",
    ]
)

pdf.ln(2)
pdf.set_font("Helvetica", "I", 9)
pdf.set_text_color(100, 116, 139)
pdf.multi_cell(
    w,
    5,
    "Google Cloud project: nth-victory-502004-m1\n"
    "Internal reporting tool for DD-DIT YouTube channel operations.",
)

pdf.output(str(OUT))
print(f"Wrote {OUT}")
